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
  timeline: {
    mode: 'windowed-vod';
    continuous: boolean;
    absoluteAnchorSeconds: number;
    mediaAnchorSeconds: number;
    durationSeconds: number;
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
    source.audioTracks.length > 64 ||
    source.textTracks.length > 16
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
    timeline,
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
  report: (source: LocalMediaSource, position: number, signal: AbortSignal) => Promise<unknown>,
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
    if (confirmed && !c.reporting && Date.now() >= c.nextReport) {
      c.reporting = true;
      c.nextReport = Date.now() + 2000;
      void report(c.source, position, lifetime.signal)
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
      c.nextText = position + 10;
    }
    const track = c.source.textTracks.find(
      (t) => `subtitle:${t.textRef}` === selected && t.available,
    );
    if (!track || c.job || position < c.nextText || snapshot.pending) return;
    c.nextText = position + 20;
    const job = new AbortController();
    c.job = job;
    const signal = AbortSignal.any([job.signal, lifetime.signal, AbortSignal.timeout(35_000)]);
    void (async () => {
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
      };
    },
    dispose() {
      lifetime.abort();
      current = null;
    },
  };
}
