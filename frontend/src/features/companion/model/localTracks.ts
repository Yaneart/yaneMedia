import type { PlayerEvent, PlayerSource, YanePlayerElement } from '@yaneart/yaneplayer';
import { COMPANION_ORIGIN } from '../api/companionClient';

export type LocalAudio = {
  audioRef: string;
  label: string;
  language?: string;
  codec: string;
  channels: number;
  default: boolean;
};
export type LocalText = {
  textRef: string;
  label: string;
  language?: string;
  format: 'vtt' | 'ass' | 'pgs' | 'vobsub';
  default: boolean;
  forced: boolean;
  sdh: boolean;
  available: boolean;
  unavailableReason?: string;
  url: string;
  fonts: string[];
};
export type LocalMediaSource = {
  id: string;
  revision: number;
  type: 'hls';
  url: string;
  audioTracks: LocalAudio[];
  textTracks: LocalText[];
  textWindowSeconds?: 30;
  timeline: {
    mode: 'windowed-vod';
    continuous: boolean;
    absoluteAnchorSeconds: number;
    mediaAnchorSeconds: number;
    durationSeconds: number;
    videoEndSeconds?: number;
  };
};

const request = { allowedOrigins: [COMPANION_ORIGIN], credentials: 'omit' as const };
const textReasons: Record<string, string> = {
  BITMAP_SUBTITLES_UNSUPPORTED: 'Графические субтитры PGS/VobSub пока не поддерживаются.',
  SUBTITLE_CODEC_UNSUPPORTED: 'Формат этой дорожки субтитров пока не поддерживается.',
};
const invalid = (): never => {
  throw new Error('INVALID_LOCAL_MEDIA');
};
const ref = (value: string) => /^[a-f0-9]{64}$/.test(value);

// Match the player's descriptive language preferences, never saved track IDs.
export function preferredLocalTrack<
  T extends {
    language?: string;
    default?: boolean;
    available?: boolean;
    forced?: boolean;
    sdh?: boolean;
  },
>(
  tracks: readonly T[],
  languages: readonly string[] = [],
  flags: { forced?: boolean; sdh?: boolean } = {},
): T | undefined {
  const choices = tracks
    .filter(
      (t) =>
        t.available !== false &&
        (flags.forced === undefined || !!t.forced === flags.forced) &&
        (flags.sdh === undefined || !!t.sdh === flags.sdh),
    )
    .sort((a, b) => Number(!!b.default) - Number(!!a.default));
  const language = (value: string) => value.toLowerCase().replaceAll('_', '-');
  if (!languages.length) return choices[0];
  for (const wanted of languages.map(language)) {
    const match =
      choices.find((t) => t.language && language(t.language) === wanted) ??
      choices.find(
        (t) => t.language && language(t.language).split('-')[0] === wanted.split('-')[0],
      );
    if (match) return match;
  }
}

// This maps the LC-007 track boundary only. Admission, routing and the ordinary
// media page's host adapter remain LC-008. The player owns controls and rendering.
export function localTrackSource(source: LocalMediaSource): PlayerSource {
  const match = /^http:\/\/127\.0\.0\.1:45723\/v1\/media\/[a-f0-9]{64}\//.exec(source.url);
  if (
    !match ||
    source.url !== `${match[0]}master.m3u8` ||
    !Number.isSafeInteger(source.revision) ||
    source.revision < 1
  )
    return invalid();
  const base = match[0];
  const timeline = source.timeline;
  if (
    !timeline ||
    timeline.mode !== 'windowed-vod' ||
    ![timeline.absoluteAnchorSeconds, timeline.mediaAnchorSeconds, timeline.durationSeconds].every(
      Number.isFinite,
    ) ||
    timeline.absoluteAnchorSeconds < 0 ||
    timeline.mediaAnchorSeconds < 0 ||
    timeline.durationSeconds <= timeline.absoluteAnchorSeconds ||
    (timeline.videoEndSeconds !== undefined &&
      (!Number.isFinite(timeline.videoEndSeconds) ||
        timeline.videoEndSeconds <= timeline.absoluteAnchorSeconds ||
        timeline.videoEndSeconds > timeline.durationSeconds)) ||
    source.audioTracks.length > 64 ||
    source.textTracks.length > 16 ||
    (source.textWindowSeconds !== undefined && source.textWindowSeconds !== 30)
  )
    return invalid();
  const seen = new Set<string>();
  const unique = (value: string) => {
    if (!ref(value) || seen.has(value)) return invalid();
    seen.add(value);
    return value;
  };
  return {
    id: source.id,
    revision: String(source.revision),
    kind: 'hls',
    src: source.url,
    hlsPlayback: 'mse',
    crossOrigin: 'anonymous',
    request,
    timeline: {
      ...timeline,
      ...(timeline.videoEndSeconds !== undefined
        ? { seekableRanges: [[0, timeline.videoEndSeconds]] as const }
        : {}),
    },
    capabilities: {
      seek: 'host',
      audio: 'host',
      quality: 'none',
      playbackRates: [0.5, 1, 1.25, 1.5, 2],
    },
    audioTracks: source.audioTracks.map((a) => ({
      id: unique(a.audioRef),
      label: a.label,
      language: a.language,
      codec: a.codec,
      channels: String(a.channels),
      default: a.default,
    })),
    subtitles: source.textTracks.map((t) => {
      unique(t.textRef);
      if (
        !['vtt', 'ass', 'pgs', 'vobsub'].includes(t.format) ||
        t.url !== `${base}text-${t.textRef}.${t.format}` ||
        (t.available && !['vtt', 'ass'].includes(t.format)) ||
        t.fonts.length > 4 ||
        t.fonts.some(
          (url) =>
            !url.startsWith(base) || !/^font-[a-f0-9]{64}\.bin$/.test(url.slice(base.length)),
        )
      )
        return invalid();
      return {
        id: t.textRef,
        label: t.label,
        language: t.language,
        format: t.format,
        default: t.default,
        forced: t.forced,
        sdh: t.sdh,
        available: t.available,
        unavailableReason: t.available
          ? undefined
          : (textReasons[t.unavailableReason ?? ''] ??
            'Эта дорожка недоступна в локальном плеере.'),
        src: t.url,
        request,
        loadTimeoutMs: 35_000,
        fonts: t.fonts.map((src) => ({ src, request })),
      };
    }),
  };
}

// Caption windows use confirmed absolute progress. Refreshing cues never replaces
// video or changes play intent, speed, caption delay/style or fullscreen.
export function createLocalTrackStream(
  player: YanePlayerElement,
  report: (
    source: LocalMediaSource,
    position: number,
    signal: AbortSignal,
    textDelay?: number,
  ) => Promise<unknown>,
) {
  let lifetime = new AbortController();
  let current: {
    source: LocalMediaSource;
    reporting: boolean;
    nextReport: number;
    selected: string | null;
    nextText: number;
    coverage: number;
    job: AbortController | null;
    applying: boolean;
    delay: number | null;
  } | null = null;
  function update(snapshot: PlayerEvent['snapshot']) {
    const c = current;
    const position = snapshot.positionSeconds;
    if (
      !c ||
      snapshot.source?.id !== c.source.id ||
      snapshot.source.revision !== String(c.source.revision) ||
      position === null ||
      !Number.isFinite(position) ||
      position < 0
    )
      return;
    const confirmed =
      !snapshot.pending ||
      snapshot.pending.type === 'text' ||
      (snapshot.captions?.status === 'loading' && snapshot.playback === 'playing');
    const delay = snapshot.captions?.delaySeconds ?? 0;
    const delayChanged = c.delay !== delay;
    if (delayChanged) {
      c.delay = delay;
      c.nextReport = 0;
      c.nextText = 0;
      c.coverage = 0;
      c.job?.abort();
      c.job = null;
    }
    if (confirmed && !c.reporting && Date.now() >= c.nextReport) {
      c.reporting = true;
      c.nextReport = Date.now() + 2000;
      void report(c.source, position, lifetime.signal, delay)
        .catch(() => undefined)
        .finally(() => {
          c.reporting = false;
        });
    }
    if (snapshot.pending && snapshot.pending.type !== 'text') {
      c.job?.abort();
      c.job = null;
      c.coverage = 0;
      c.nextText = 0;
      return;
    }
    const selected = snapshot.selection.textId;
    if (c.applying && snapshot.pending?.type === 'text' && selected === null) return;
    if (selected !== c.selected) {
      c.job?.abort();
      c.job = null;
      c.selected = selected;
      c.coverage = 0;
      c.nextText = delayChanged ? position : position + 10;
    }
    const track = c.source.textTracks.find(
      (t) => `subtitle:${t.textRef}` === selected && t.available,
    );
    if (!track || c.job || position < c.nextText || position + 5 < c.coverage || snapshot.pending)
      return;
    c.nextText = position + 5;
    const job = new AbortController();
    c.job = job;
    const signal = AbortSignal.any([job.signal, lifetime.signal, AbortSignal.timeout(35_000)]);
    void (async () => {
      // Settle the exact position/delay before requesting a new caption window.
      await report(c.source, position, signal, delay);
      signal.throwIfAborted();
      const response = await fetch(track.url, {
        credentials: 'omit',
        redirect: 'error',
        cache: 'no-store',
        signal,
      });
      if (!response.ok) return;
      await response.arrayBuffer();
      const end = Number(response.headers.get('X-Yane-Text-End'));
      const latest = player.runtime?.getSnapshot();
      if (
        signal.aborted ||
        current !== c ||
        !latest ||
        latest.pending ||
        latest.selection.textId !== selected ||
        latest.source?.id !== c.source.id ||
        latest.source.revision !== String(c.source.revision) ||
        latest.positionSeconds === null ||
        end <= latest.positionSeconds ||
        (end + 0.001 < c.source.timeline.durationSeconds && latest.positionSeconds + 5 >= end) ||
        !Number.isFinite(end) ||
        end <= c.coverage
      )
        return;
      c.coverage = end;
      c.applying = true;
      try {
        await player.selectText(selected);
      } finally {
        c.applying = false;
      }
    })()
      .catch(() => undefined)
      .finally(() => {
        if (c.job === job) c.job = null;
      });
  }
  return {
    update,
    configure(source: LocalMediaSource) {
      localTrackSource(source); // Validate before any credential-free resource fetch.
      lifetime.abort();
      lifetime = new AbortController();
      current = {
        source,
        reporting: false,
        nextReport: 0,
        selected: null,
        nextText: 0,
        coverage: 0,
        job: null,
        applying: false,
        delay: null,
      };
    },
    dispose() {
      lifetime.abort();
      current = null;
    },
  };
}
