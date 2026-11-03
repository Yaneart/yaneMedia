import type { PlayerEvent, YanePlayerElement } from '@yaneart/yaneplayer';
import { torrentAccountSignal } from '@/entities/torrent-session';
import type { TorrentVideoTimeline } from '../ui/MediaVideoRenderer';

// Feedback controls server production, not the player's media command queue.
export function createTorrentStream(player: YanePlayerElement) {
  let stream: {
    url: string;
    playback: Omit<TorrentVideoTimeline, 'onReplace'>;
    revision: string;
    nextReport: number;
    reporting: boolean;
    textId: string | null;
    nextText: number;
    coverage: number;
    captionJob: AbortController | null;
    applyingCaptions: boolean;
    position: number | null;
  } | null = null;
  let lifetime = new AbortController();

  function update(snapshot: PlayerEvent['snapshot']) {
    const current = stream;
    if (
      !current?.playback.timeline.continuous ||
      snapshot.source?.revision !== current.revision ||
      snapshot.positionSeconds === null ||
      !Number.isFinite(snapshot.positionSeconds) ||
      snapshot.positionSeconds < 0
    )
      return;
    if (snapshot.pending && snapshot.pending.type !== 'text') {
      current.captionJob?.abort();
      current.captionJob = null;
      current.coverage = 0;
      current.nextText = 0;
    }
    const position = snapshot.positionSeconds;
    if (!current.reporting && Date.now() >= current.nextReport) {
      current.nextReport = Date.now() + 2_000;
      current.reporting = true;
      void fetch(new URL('progress', current.url), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-YaneMedia-CSRF': '1' },
        body: JSON.stringify({
          generation: current.playback.generation,
          positionSeconds: position,
        }),
        signal: AbortSignal.any([
          lifetime.signal,
          torrentAccountSignal(),
          AbortSignal.timeout(5_000),
        ]),
      })
        .catch(() => undefined)
        .finally(() => {
          current.reporting = false;
        });
    }
    // A host seek/audio replacement can already be playing while captions are
    // restored in the same command. Feed actual media position during that wait
    // so the bounded producer can advance; caption work still yields to commands.
    if (snapshot.pending && snapshot.pending.type !== 'text') return;
    const selected = snapshot.selection?.textId ?? null;
    if (current.applyingCaptions && snapshot.pending?.type === 'text' && selected === null) return;
    if (selected !== current.textId) {
      current.captionJob?.abort();
      current.captionJob = null;
      current.textId = selected;
      current.nextText = position + 10;
      current.coverage = 0;
    }
    if (
      current.position !== null &&
      (position < current.position - 1 || position > current.position + 10)
    ) {
      current.nextText = 0;
      current.coverage = 0;
    }
    current.position = position;
    const track = current.playback.subtitleTracks?.find(
      (item) => `subtitle:${item.ref}` === selected,
    );
    if (
      !track ||
      current.captionJob ||
      position < current.nextText ||
      snapshot.intent !== 'playing'
    )
      return;
    current.nextText = position + 30;
    const job = new AbortController();
    current.captionJob = job;
    const signal = AbortSignal.any([
      job.signal,
      lifetime.signal,
      torrentAccountSignal(),
      AbortSignal.timeout(60_000),
    ]);
    void (async () => {
      const response = await fetch(track.url, {
        credentials: 'include',
        headers: { 'X-YaneMedia-Subtitle-Prefetch': '1' },
        signal,
      });
      if (!response.ok) return;
      await response.arrayBuffer();
      const end = Number(response.headers.get('X-YaneMedia-Subtitle-End'));
      const latest = player.runtime?.getSnapshot();
      if (
        !signal.aborted &&
        stream === current &&
        latest?.source?.revision === current.revision &&
        !latest.pending &&
        latest.selection.textId === selected &&
        end > current.coverage
      ) {
        current.coverage = end;
        // The resource is now in the backend's bounded cache. Re-selecting a
        // managed caption track updates cues without replacing or pausing video.
        current.applyingCaptions = true;
        try {
          await player.selectText(selected);
        } finally {
          current.applyingCaptions = false;
        }
      }
    })()
      .catch(() => undefined)
      .finally(() => {
        if (current.captionJob === job) current.captionJob = null;
      });
  }
  return {
    update,
    configure(url: string, playback: Omit<TorrentVideoTimeline, 'onReplace'>, revision: string) {
      if (stream?.revision === revision) return;
      lifetime.abort();
      lifetime = new AbortController();
      stream = {
        url,
        playback,
        revision,
        nextReport: 0,
        reporting: false,
        textId: null,
        coverage: 0,
        nextText: 0,
        captionJob: null,
        applyingCaptions: false,
        position: null,
      };
    },
    dispose() {
      lifetime.abort();
      stream = null;
    },
  };
}
