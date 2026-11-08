import type { MediaSourceOption } from '@/entities/media-source';
import type { SelectOption } from '@/shared';
import { rememberTorrentAudio, type TorrentSession } from '@/entities/torrent-session';
import { useLayoutEffect, useRef } from 'react';
import {
  type HostResult,
  type PlayerEvent,
  type PlayerNavigation,
  type PlayerSource,
  type PreferencesAdapter,
  type YanePlayerElement,
} from '@yaneart/yaneplayer';
import '@yaneart/yaneplayer';
import { createTorrentStream } from '../model/torrentStream';
import { createLocalTrackStream, localTrackSource, type LocalPlayback } from '@/features/companion';

export type MediaVideoDirectControls = {
  tracks: readonly (SelectOption & { language?: string })[];
  selectedTrackKey: string | null;
  qualities: readonly SelectOption[];
  selectedQualityKey: string | null;
  onSelectionChange: (
    trackKey: string | null,
    qualityKey: string | null,
    positionSeconds: number,
    intent: 'playing' | 'paused',
  ) => void;
};

export type TorrentVideoTimeline = {
  generation?: number;
  startPositionSeconds: number;
  durationSeconds: number | null;
  timeline: NonNullable<TorrentSession['playback']>['timeline'];
  playbackRates: readonly number[];
  audioTracks: NonNullable<TorrentSession['playback']>['audioTracks'];
  selectedAudioTrackRef: string;
  subtitleTracks?: NonNullable<TorrentSession['playback']>['subtitleTracks'];
  output?: NonNullable<TorrentSession['playback']>['output'];
  onReplace: (
    positionSeconds: number,
    signal: AbortSignal,
    audioTrackRef?: string,
  ) => Promise<TorrentSession>;
};

function torrentDescriptor(
  source: MediaSourceOption,
  title: string,
  playback: Omit<TorrentVideoTimeline, 'onReplace'>,
): PlayerSource {
  return {
    id: 'media',
    revision: JSON.stringify([source.sourceRef, source.url, playback.timeline]),
    kind: 'hls',
    src: source.url,
    title,
    crossOrigin: 'use-credentials',
    audioTracks: playback.audioTracks.map((track) => ({
      id: track.ref,
      label: track.label,
      language: track.language ?? undefined,
      channels: track.channels === null ? undefined : String(track.channels),
      default: track.isDefault,
    })),
    subtitles: playback.subtitleTracks?.map((track) => ({
      id: track.ref,
      label: track.label,
      language: track.language ?? undefined,
      format: track.format,
      loadTimeoutMs: 60_000,
      src: track.url,
      default: track.isDefault,
      forced: track.isForced,
      sdh: track.isSdh,
      available: track.available,
      unavailableReason: track.unavailableReason ?? undefined,
      request: { allowedOrigins: [new URL(track.url).origin], credentials: 'include' as const },
      fonts: track.fonts.map((font) => ({
        src: font.url,
        request: { allowedOrigins: [new URL(font.url).origin], credentials: 'include' as const },
      })),
    })),
    timeline: {
      mode: 'windowed-vod',
      ...playback.timeline,
      durationSeconds: playback.durationSeconds,
    },
    capabilities: {
      seek: 'host',
      audio: 'host',
      quality: 'none',
      playbackRates: playback.playbackRates,
    },
  };
}

type MediaVideoRendererProps = {
  source: MediaSourceOption;
  mediaTitle: string;
  shouldAutoPlay: boolean;
  initialPositionSeconds: number;
  directControls?: MediaVideoDirectControls;
  torrentTimeline?: TorrentVideoTimeline;
  localPlayback?: LocalPlayback;
  preferences?: PreferencesAdapter;
  navigation?: PlayerNavigation;
  onReady: () => void;
  onError: () => void;
  onPlay: () => void;
  onPause: () => void;
  onProgress: (
    positionSeconds: number,
    durationSeconds: number | undefined,
    reason: 'periodic' | 'metadata' | 'seek' | 'pause' | 'ended',
  ) => void;
};

// App callbacks select URLs/sessions; yanePlayer owns media, controls and command intent.
export function MediaVideoRenderer(props: MediaVideoRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const elementRef = useRef<YanePlayerElement | null>(null);
  const propsRef = useRef(props);
  const pendingRef = useRef<((result?: HostResult) => void) | null>(null);
  const loadedRevisionRef = useRef<string | null>(null);
  const loadedMediaRef = useRef<{ sourceRef: string; url: string } | null>(null);
  const torrentCommandRef = useRef<{ sourceRef: string } | null>(null);
  const torrentAudioRef = useRef<string | null>(null);
  const torrentTextRef = useRef<{
    text: PlayerEvent['snapshot']['textTracks'][number] | null;
  } | null>(null);
  const streamRef = useRef<ReturnType<typeof createTorrentStream> | null>(null);
  const localStreamRef = useRef<ReturnType<typeof createLocalTrackStream> | null>(null);
  const appliedLocalRef = useRef<LocalPlayback | null>(null);
  const localCommandRef = useRef(false);
  const loadedSourceIdRef = useRef<string | null>(null);
  const initializingRef = useRef<{ position: number } | null>(null);
  const settleSourceRef = useRef<() => void>(() => undefined);

  useLayoutEffect(() => {
    propsRef.current = props;
  });

  useLayoutEffect(() => {
    const player = document.createElement('yane-player');
    elementRef.current = player;
    const stream = createTorrentStream(player);
    streamRef.current = stream;
    const localStream = createLocalTrackStream(
      player,
      (source, position, signal) =>
        propsRef.current.localPlayback?.report(source, position, signal) ?? Promise.resolve(),
    );
    localStreamRef.current = localStream;
    player.lang = 'ru';
    player.className = 'media-video-player';
    player.preferences = propsRef.current.preferences;
    let disposed = false;
    let ready = false;
    let readyRevision: string | null = null;
    let previousPlayback = 'idle';
    let previousIntent: PlayerEvent['snapshot']['intent'] = 'paused';
    let seeking = false;
    let renewedRevision: string | null = null;
    let advancedRevision: string | null = null;
    let playingAtEnd = false;
    let confirmed: {
      position: number;
      duration: number | undefined;
      props: MediaVideoRendererProps;
    } | null = null;
    const flush = () => {
      if (!confirmed) return;
      confirmed.props.onProgress(confirmed.position, confirmed.duration, 'pause');
      confirmed.props.onPause();
    };
    const continueTorrent = (snapshot: PlayerEvent['snapshot']) => {
      if (
        disposed ||
        torrentCommandRef.current ||
        !propsRef.current.torrentTimeline ||
        propsRef.current.torrentTimeline.timeline.continuous ||
        snapshot.pending ||
        snapshot.playback !== 'ended' ||
        snapshot.intent !== 'playing' ||
        snapshot.source?.revision !== loadedRevisionRef.current ||
        initializingRef.current ||
        renewedRevision === snapshot.source?.revision ||
        snapshot.positionSeconds === null ||
        (snapshot.durationSeconds !== null &&
          snapshot.positionSeconds >= snapshot.durationSeconds - 0.5)
      )
        return;
      renewedRevision = snapshot.source.revision;
      const edge = Math.max(
        snapshot.positionSeconds,
        ...snapshot.seekable.map((range) => range[1]),
      );
      // A text command may have held the queue when EOF fired. State changes
      // also retry admission once it settles, once per completed revision.
      void player.seek(edge + 0.001).catch(() => {
        /* yp-error reports command failures. */
      });
    };
    const replaceTorrent = async (position: number, signal: AbortSignal, audioId?: string) => {
      const command = { sourceRef: propsRef.current.source.sourceRef };
      torrentCommandRef.current = command;
      torrentAudioRef.current = null;
      try {
        const current = propsRef.current;
        const ready = await current.torrentTimeline!.onReplace(position, signal, audioId);
        signal.throwIfAborted();
        if (disposed || !ready.playback)
          throw new DOMException('Playback change cancelled', 'AbortError');
        const descriptor = torrentDescriptor(
          {
            ...current.source,
            sourceRef: `torrent:${ready.id}:${ready.playback.generation}`,
            url: ready.playback.hlsUrl,
          },
          current.mediaTitle,
          ready.playback,
        );
        loadedRevisionRef.current = descriptor.revision;
        stream.configure(ready.playback.hlsUrl, ready.playback, descriptor.revision);
        const selected = ready.playback.audioTracks.find(
          (track) => track.ref === ready.playback!.selectedAudioTrackRef,
        );
        if (audioId && selected) rememberTorrentAudio(selected);
        torrentAudioRef.current = ready.playback.selectedAudioTrackRef;
        return { source: descriptor, selection: { audioId: ready.playback.selectedAudioTrackRef } };
      } finally {
        if (torrentCommandRef.current === command) torrentCommandRef.current = null;
      }
    };
    const report = (
      event: PlayerEvent,
      reason: Parameters<MediaVideoRendererProps['onProgress']>[2],
    ) => {
      const { snapshot } = event;
      const captionsOnly =
        snapshot.pending?.type === 'text' ||
        ((propsRef.current.torrentTimeline || propsRef.current.localPlayback) &&
          snapshot.captions?.status === 'loading' &&
          snapshot.playback === 'playing' &&
          snapshot.selection?.audioId === torrentAudioRef.current);
      if (
        initializingRef.current ||
        propsRef.current.navigation?.pending ||
        snapshot.source?.revision !== loadedRevisionRef.current ||
        (snapshot.pending && !captionsOnly) ||
        snapshot.positionSeconds === null
      )
        return;
      confirmed = {
        position: snapshot.positionSeconds,
        duration: snapshot.durationSeconds ?? undefined,
        props: propsRef.current,
      };
      propsRef.current.onProgress(
        snapshot.positionSeconds,
        snapshot.durationSeconds ?? undefined,
        reason,
      );
    };
    const onState = ({ detail: event }: CustomEvent<PlayerEvent>) => {
      if (
        disposed ||
        event.source?.id !== loadedSourceIdRef.current ||
        event.source?.revision !== loadedRevisionRef.current
      )
        return;
      const { snapshot } = event;
      stream.update(snapshot);
      localStream.update(snapshot);
      if (initializingRef.current) return;
      if (snapshot.playback === 'playing') playingAtEnd = true;
      if (
        snapshot.playback === 'paused' &&
        (snapshot.durationSeconds === null ||
          (snapshot.positionSeconds ?? 0) < snapshot.durationSeconds - 0.5)
      )
        playingAtEnd = false;
      if (snapshot.source?.revision !== readyRevision) {
        readyRevision = snapshot.source?.revision ?? null;
        ready = false;
      }
      if (snapshot.pending?.type === 'source') ready = false;
      if (snapshot.pending?.type === 'seek') seeking = true;
      if (
        !ready &&
        !snapshot.pending &&
        ['ready', 'playing', 'paused'].includes(snapshot.playback)
      ) {
        ready = true;
        propsRef.current.onReady();
        report(event, 'metadata');
      }
      if (seeking && !snapshot.pending) {
        report(event, 'seek');
        seeking = false;
      }
      if (
        snapshot.playback !== previousPlayback ||
        (snapshot.playback === 'paused' && snapshot.intent !== previousIntent)
      ) {
        if (snapshot.playback === 'playing' && !propsRef.current.navigation?.pending)
          propsRef.current.onPlay();
        if (
          snapshot.playback === 'paused' &&
          ready &&
          snapshot.intent === 'paused' &&
          !propsRef.current.navigation?.pending
        ) {
          report(event, 'pause');
          propsRef.current.onPause();
        }
        previousPlayback = snapshot.playback;
      }
      previousIntent = snapshot.intent;
      continueTorrent(snapshot);
    };
    settleSourceRef.current = () => {
      const snapshot = player.runtime?.getSnapshot();
      if (snapshot?.source)
        onState({
          detail: { type: 'statechange', source: snapshot.source, snapshot },
        } as CustomEvent<PlayerEvent>);
    };
    const onPosition = ({ detail: event }: CustomEvent<PlayerEvent>) => {
      if (
        disposed ||
        event.source?.id !== loadedSourceIdRef.current ||
        event.source?.revision !== loadedRevisionRef.current
      )
        return;
      stream.update(event.snapshot);
      localStream.update(event.snapshot);
      const windowEnded =
        event.snapshot.playback === 'ended' &&
        propsRef.current.torrentTimeline &&
        !propsRef.current.torrentTimeline.timeline.continuous &&
        (event.snapshot.durationSeconds === null ||
          (event.snapshot.positionSeconds ?? 0) < event.snapshot.durationSeconds - 0.5);
      report(
        event,
        event.snapshot.playback === 'ended' && !windowEnded
          ? 'ended'
          : seeking
            ? 'seek'
            : 'periodic',
      );
      if (!event.snapshot.pending) seeking = false;
    };
    const onError = ({ detail: event }: CustomEvent<PlayerEvent>) => {
      if (
        disposed ||
        event.source?.id !== loadedSourceIdRef.current ||
        event.source?.revision !== loadedRevisionRef.current
      )
        return;
      // Autoplay denial and command/platform errors keep explicit controls usable.
      if (
        event.snapshot.playback === 'error' &&
        !torrentCommandRef.current &&
        !localCommandRef.current &&
        !propsRef.current.navigation?.pending
      )
        propsRef.current.onError();
    };
    const onEnded = ({ detail: event }: CustomEvent<PlayerEvent>) => {
      if (
        disposed ||
        event.source?.id !== loadedSourceIdRef.current ||
        event.source?.revision !== loadedRevisionRef.current ||
        initializingRef.current ||
        event.snapshot.pending
      )
        return;
      continueTorrent(event.snapshot);
      const { snapshot } = event;
      if (
        (propsRef.current.torrentTimeline || propsRef.current.localPlayback) &&
        propsRef.current.navigation?.autoAdvance &&
        propsRef.current.navigation.next &&
        playingAtEnd &&
        snapshot.durationSeconds !== null &&
        (snapshot.positionSeconds ?? 0) >= snapshot.durationSeconds - 0.5 &&
        advancedRevision !== snapshot.source?.revision
      ) {
        advancedRevision = snapshot.source?.revision ?? null;
        propsRef.current.onPlay();
        void player.navigate('next').catch(() => {
          /* The navigation menu owns retry. */
        });
      }
    };
    player.addEventListener('yp-statechange', onState);
    player.addEventListener('yp-positionchange', onPosition);
    player.addEventListener('yp-error', onError);
    player.addEventListener('yp-ended', onEnded);
    player.host = {
      execute(command, context) {
        const current = propsRef.current;
        if (current.localPlayback) {
          const binding = current.localPlayback;
          localCommandRef.current = true;
          return binding
            .execute(command, context)
            .then((result) => {
              context.signal.throwIfAborted();
              if (disposed || propsRef.current.localPlayback !== binding)
                throw new DOMException('Source changed', 'AbortError');
              if (!result.source) return { selection: { audioId: result.audioId } };
              const descriptor = localTrackSource(result.source);
              loadedRevisionRef.current = descriptor.revision;
              loadedSourceIdRef.current = descriptor.id;
              torrentAudioRef.current = result.audioId;
              localStream.configure(result.source);
              return { source: descriptor, selection: { audioId: result.audioId } };
            })
            .finally(() => {
              localCommandRef.current = false;
            });
        }
        if (current.torrentTimeline) {
          if (command.type !== 'seek' && command.type !== 'audio')
            return Promise.reject(new Error('Unsupported torrent command'));
          if (
            command.target.positionSeconds === undefined &&
            command.target.audioId === torrentAudioRef.current
          )
            return Promise.resolve({ selection: { audioId: command.target.audioId } });
          const position =
            command.target.positionSeconds ??
            initializingRef.current?.position ??
            context.positionSeconds;
          if (position === null || position === undefined)
            return Promise.reject(new Error('Torrent position unavailable'));
          return replaceTorrent(position, context.signal, command.target.audioId);
        }
        const controls = current.directControls;
        const audioId = command.target.audioId ?? controls?.selectedTrackKey ?? null;
        const qualityId = command.target.qualityId ?? controls?.selectedQualityKey ?? null;
        if (
          controls &&
          audioId === controls.selectedTrackKey &&
          qualityId === controls.selectedQualityKey
        ) {
          return Promise.resolve({ selection: { audioId, qualityId } });
        }
        // Save confirmed position before the app replaces its source/session.
        if (context.positionSeconds !== null && !initializingRef.current) {
          current.onProgress(
            context.positionSeconds,
            player.runtime?.getSnapshot().durationSeconds ?? undefined,
            'pause',
          );
        }
        return new Promise<HostResult>((resolve, reject) => {
          const finish = (result?: HostResult) => {
            clearTimeout(timeout);
            context.signal.removeEventListener('abort', abort);
            pendingRef.current = null;
            if (result) resolve(result);
            else reject(new DOMException('Playback change cancelled', 'AbortError'));
          };
          const abort = () => finish();
          const timeout = setTimeout(() => {
            finish();
            if (!disposed) propsRef.current.onError();
          }, 30_000);
          context.signal.addEventListener('abort', abort, { once: true });
          if (context.signal.aborted) return abort();
          pendingRef.current = finish;
          try {
            if (controls && (command.type === 'audio' || command.type === 'quality'))
              controls.onSelectionChange(
                audioId,
                qualityId,
                initializingRef.current?.position ?? context.positionSeconds ?? 0,
                context.intent,
              );
            else finish();
          } catch {
            finish();
          }
        });
      },
    };
    containerRef.current!.append(player);
    window.addEventListener('pagehide', flush);
    return () => {
      disposed = true;
      flush();
      window.removeEventListener('pagehide', flush);
      stream.dispose();
      localStream.dispose();
      localStreamRef.current = null;
      streamRef.current = null;
      player.removeEventListener('yp-statechange', onState);
      player.removeEventListener('yp-positionchange', onPosition);
      player.removeEventListener('yp-error', onError);
      player.removeEventListener('yp-ended', onEnded);
      pendingRef.current?.();
      player.remove(); // disconnect disposes transport/workers
      elementRef.current = null;
      loadedRevisionRef.current = null;
      loadedMediaRef.current = null;
      loadedSourceIdRef.current = null;
      appliedLocalRef.current = null;
      localCommandRef.current = false;
      torrentCommandRef.current = null;
      torrentAudioRef.current = null;
      torrentTextRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const player = elementRef.current!;
    const { source, directControls: controls, torrentTimeline: timeline } = props;
    const local = props.localPlayback;
    const descriptor: PlayerSource = local
      ? localTrackSource(local.source)
      : timeline
        ? torrentDescriptor(source, props.mediaTitle, timeline)
        : {
            id: 'media',
            revision: JSON.stringify([
              source.sourceRef,
              source.url,
              controls?.tracks,
              controls?.qualities,
            ]),
            kind: source.kind as 'mp4' | 'hls',
            src: source.url,
            ...(source.kind === 'hls' ? { hlsRedirects: 'follow' as const } : {}),
            // VideoHUB serves native MP4 without CORS response headers.
            ...(source.kind === 'mp4' && source.provider === 'videohub-streaming'
              ? { crossOrigin: null }
              : {}),
            title: props.mediaTitle,
            audioTracks: controls?.tracks.map(({ value, label, language }) => ({
              id: value,
              label,
              language,
            })),
            qualities: controls?.qualities.map(({ value, label }) => ({ id: value, label })),
            capabilities: {
              audio: controls && controls.tracks.length > 1 ? 'host' : 'transport',
              quality: controls && controls.qualities.length > 1 ? 'host' : 'transport',
              autoQuality: false,
            },
          };
    if ((timeline || local) && props.navigation?.pending && !torrentTextRef.current) {
      const snapshot = player.runtime?.getSnapshot();
      torrentTextRef.current = {
        text: snapshot?.textTracks?.find((track) => track.id === snapshot.selection.textId) ?? null,
      };
    }
    if (
      !props.navigation?.pending &&
      loadedSourceIdRef.current === descriptor.id &&
      loadedRevisionRef.current === descriptor.revision
    )
      torrentTextRef.current = null;
    player.label = `Плеер ${source.label}: ${props.mediaTitle}`;
    // A rolling HLS window emits media EOF before the episode finishes.
    // Only the confirmed absolute episode end may advance torrent files.
    player.navigation =
      timeline || local ? { ...props.navigation, autoAdvance: false } : (props.navigation ?? {});
    const timeout = local ? 125_000 : 15_000;
    if (player.commandTimeoutMs !== timeout) player.commandTimeoutMs = timeout;
    if (local && appliedLocalRef.current === local) return;
    const command = torrentCommandRef.current;
    // Host commands own generation updates only within their torrent session.
    // A different release/provider must replace the source immediately, which
    // aborts the old command through the player's source lifetime.
    if (
      (command &&
        source.provider === 'torrent' &&
        command.sourceRef.split(':').slice(0, 2).join(':') ===
          source.sourceRef.split(':').slice(0, 2).join(':')) ||
      (loadedSourceIdRef.current === descriptor.id &&
        loadedRevisionRef.current === descriptor.revision)
    )
      return;
    const sameMedia =
      !timeline &&
      !local &&
      loadedMediaRef.current?.sourceRef === source.sourceRef &&
      loadedMediaRef.current.url === source.url;
    const current = sameMedia ? player.runtime?.getSnapshot() : undefined;
    const retainedPosition = sameMedia
      ? ((!current?.pending ? current?.positionSeconds : null) ?? initializingRef.current?.position)
      : null;
    const torrentTracks =
      (timeline || local) &&
      (loadedMediaRef.current?.sourceRef.startsWith('torrent:') || appliedLocalRef.current)
        ? player.runtime?.getSnapshot()
        : undefined;
    const previousText = torrentTextRef.current
      ? torrentTextRef.current.text
      : torrentTracks?.textTracks?.find((track) => track.id === torrentTracks.selection.textId);
    torrentTextRef.current = null;
    torrentCommandRef.current = null;
    loadedRevisionRef.current = descriptor.revision;
    loadedSourceIdRef.current = descriptor.id;
    appliedLocalRef.current = local ?? null;
    loadedMediaRef.current = { sourceRef: source.sourceRef, url: source.url };
    if (timeline) streamRef.current?.configure(source.url, timeline, descriptor.revision);
    else streamRef.current?.dispose();
    if (local) localStreamRef.current?.configure(local.source);
    else localStreamRef.current?.dispose();
    if (pendingRef.current) {
      pendingRef.current({
        source: descriptor,
        selection: {
          audioId: controls?.selectedTrackKey ?? null,
          qualityId: controls?.selectedQualityKey ?? null,
        },
      });
    } else {
      torrentAudioRef.current = local?.audioId ?? timeline?.selectedAudioTrackRef ?? null;
      const initial = {
        position: local
          ? local.position
          : timeline
            ? timeline.timeline.continuous
              ? Math.max(timeline.startPositionSeconds, props.initialPositionSeconds)
              : timeline.startPositionSeconds
            : (retainedPosition ?? props.initialPositionSeconds),
      };
      initializingRef.current = initial;
      void player
        .setSource(descriptor, {
          positionSeconds: initial.position,
          intent: current?.intent ?? (props.shouldAutoPlay ? 'playing' : 'paused'),
          ...(torrentTracks ? { trackPreferences: { text: null } } : {}),
        })
        .then(async () => {
          if (
            loadedSourceIdRef.current !== descriptor.id ||
            loadedRevisionRef.current !== descriptor.revision
          )
            return;
          const selection = player.runtime?.getSnapshot().selection;
          if (local && !selection?.audioId) await player.selectAudio(local.audioId);
          if (timeline && !selection?.audioId)
            await player.selectAudio(timeline.selectedAudioTrackRef);
          if (
            controls?.selectedTrackKey &&
            descriptor.capabilities?.audio === 'host' &&
            !selection?.audioId
          )
            await player.selectAudio(controls.selectedTrackKey);
          if (controls?.selectedQualityKey && descriptor.capabilities?.quality === 'host')
            await player.selectQuality(controls.selectedQualityKey);
          if ((timeline || local) && previousText) {
            const target = player.runtime
              ?.getSnapshot()
              .textTracks.find(
                (track) =>
                  track.available !== false &&
                  track.label === previousText.label &&
                  track.language === previousText.language &&
                  !!track.forced === !!previousText.forced &&
                  !!track.sdh === !!previousText.sdh,
              );
            if (
              target &&
              loadedSourceIdRef.current === descriptor.id &&
              loadedRevisionRef.current === descriptor.revision
            )
              await player.selectText(target.id);
          }
        })
        .catch(() => {
          /* yp-error carries normalized fatal errors. */
        })
        .finally(() => {
          if (initializingRef.current === initial) {
            initializingRef.current = null;
            settleSourceRef.current();
          }
        });
    }
  });

  return <div ref={containerRef} className="absolute inset-0 z-0 size-full bg-black" />;
}
