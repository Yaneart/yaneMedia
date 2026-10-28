import type { MediaSourceOption } from '@/entities/media-source';
import type { SelectOption } from '@/shared';
import { useLayoutEffect, useRef } from 'react';
import {
  type HostResult,
  type PlayerEvent,
  type PlayerSource,
  type YanePlayerElement,
} from '@yaneart/yaneplayer';
import '@yaneart/yaneplayer';

export type MediaVideoDirectControls = {
  tracks: readonly SelectOption[];
  selectedTrackKey: string | null;
  qualities: readonly SelectOption[];
  selectedQualityKey: string | null;
  onSelectionChange: (
    trackKey: string | null,
    qualityKey: string | null,
    positionSeconds: number,
    intent: 'playing' | 'paused',
  ) => void;
  onNextEpisode?: () => void;
};

export type TorrentVideoTimeline = {
  startPositionSeconds: number;
  durationSeconds: number | null;
  onSeek: (positionSeconds: number) => void;
};

type MediaVideoRendererProps = {
  source: MediaSourceOption;
  mediaTitle: string;
  shouldAutoPlay: boolean;
  initialPositionSeconds: number;
  directControls?: MediaVideoDirectControls;
  torrentTimeline?: TorrentVideoTimeline;
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

  useLayoutEffect(() => {
    propsRef.current = props;
  });

  useLayoutEffect(() => {
    const player = document.createElement('yane-player');
    elementRef.current = player;
    player.lang = 'ru';
    player.className = 'media-video-player';
    let disposed = false;
    let ready = false;
    let readyRevision: string | null = null;
    let previousPlayback = 'idle';
    let seeking = false;
    const report = (
      event: PlayerEvent,
      reason: Parameters<MediaVideoRendererProps['onProgress']>[2],
    ) => {
      const { snapshot } = event;
      if (
        snapshot.source?.revision !== loadedRevisionRef.current ||
        snapshot.pending ||
        snapshot.positionSeconds === null
      )
        return;
      propsRef.current.onProgress(
        snapshot.positionSeconds,
        snapshot.durationSeconds ?? undefined,
        reason,
      );
    };
    const onState = ({ detail: event }: CustomEvent<PlayerEvent>) => {
      if (disposed || event.source?.revision !== loadedRevisionRef.current) return;
      const { snapshot } = event;
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
      if (snapshot.playback !== previousPlayback) {
        if (snapshot.playback === 'playing') propsRef.current.onPlay();
        if (snapshot.playback === 'paused' && ready && !snapshot.pending) {
          report(event, 'pause');
          propsRef.current.onPause();
        }
        previousPlayback = snapshot.playback;
      }
    };
    const onPosition = ({ detail: event }: CustomEvent<PlayerEvent>) => {
      if (disposed || event.source?.revision !== loadedRevisionRef.current) return;
      report(event, event.snapshot.playback === 'ended' ? 'ended' : seeking ? 'seek' : 'periodic');
      if (!event.snapshot.pending) seeking = false;
    };
    const onError = ({ detail: event }: CustomEvent<PlayerEvent>) => {
      if (disposed || event.source?.revision !== loadedRevisionRef.current) return;
      // Autoplay denial and command/platform errors keep explicit controls usable.
      if (event.snapshot.playback === 'error') propsRef.current.onError();
    };
    player.addEventListener('yp-statechange', onState);
    player.addEventListener('yp-positionchange', onPosition);
    player.addEventListener('yp-error', onError);
    player.host = {
      execute(command, context) {
        const current = propsRef.current;
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
        if (context.positionSeconds !== null) {
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
            if (command.type === 'seek' && current.torrentTimeline)
              current.torrentTimeline.onSeek(command.seconds);
            else if (controls && (command.type === 'audio' || command.type === 'quality'))
              controls.onSelectionChange(
                audioId,
                qualityId,
                context.positionSeconds ?? 0,
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
    return () => {
      disposed = true;
      player.removeEventListener('yp-statechange', onState);
      player.removeEventListener('yp-positionchange', onPosition);
      player.removeEventListener('yp-error', onError);
      pendingRef.current?.();
      player.remove(); // disconnect disposes transport/workers
      elementRef.current = null;
      loadedRevisionRef.current = null;
    };
  }, []);

  useLayoutEffect(() => {
    const player = elementRef.current!;
    const { source, directControls: controls, torrentTimeline: timeline } = props;
    const descriptor: PlayerSource = {
      id: 'media',
      revision: JSON.stringify([source.sourceRef, source.url, timeline?.startPositionSeconds]),
      kind: source.kind as 'mp4' | 'hls',
      src: source.url,
      // VideoHUB serves native MP4 without CORS response headers.
      ...(source.kind === 'mp4' && source.provider === 'videohub-streaming'
        ? { crossOrigin: null }
        : {}),
      title: props.mediaTitle,
      ...(timeline
        ? {
            timeline: {
              mode: 'windowed-vod',
              absoluteAnchorSeconds: timeline.startPositionSeconds,
              mediaAnchorSeconds: 0,
              durationSeconds: timeline.durationSeconds,
            },
            crossOrigin: 'use-credentials',
            capabilities: { seek: 'host', playbackRates: [1] },
          }
        : {
            audioTracks: controls?.tracks.map(({ value, label }) => ({ id: value, label })),
            qualities: controls?.qualities.map(({ value, label }) => ({ id: value, label })),
            capabilities: {
              audio: controls && controls.tracks.length > 1 ? 'host' : 'transport',
              quality: controls && controls.qualities.length > 1 ? 'host' : 'transport',
            },
          }),
    };
    player.label = `Плеер ${source.label}: ${props.mediaTitle}`;
    player.navigation = controls?.onNextEpisode
      ? { next: () => propsRef.current.directControls?.onNextEpisode?.() }
      : {};
    if (loadedRevisionRef.current === descriptor.revision) return;
    loadedRevisionRef.current = descriptor.revision;
    if (pendingRef.current) {
      pendingRef.current({
        source: descriptor,
        selection: {
          audioId: controls?.selectedTrackKey ?? null,
          qualityId: controls?.selectedQualityKey ?? null,
        },
      });
    } else {
      void player
        .setSource(descriptor, {
          positionSeconds: timeline ? timeline.startPositionSeconds : props.initialPositionSeconds,
          intent: props.shouldAutoPlay ? 'playing' : 'paused',
        })
        .then(async () => {
          if (controls?.selectedTrackKey && descriptor.capabilities?.audio === 'host')
            await player.selectAudio(controls.selectedTrackKey);
          if (controls?.selectedQualityKey && descriptor.capabilities?.quality === 'host')
            await player.selectQuality(controls.selectedQualityKey);
        })
        .catch(() => {
          /* yp-error carries normalized fatal errors. */
        });
    }
  });

  return <div ref={containerRef} className="absolute inset-0 z-0 size-full bg-black" />;
}
