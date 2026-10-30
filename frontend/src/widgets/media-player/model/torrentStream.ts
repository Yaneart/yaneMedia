import type { PlayerEvent, YanePlayerElement } from '@yaneart/yaneplayer';
import { torrentAccountSignal } from '@/entities/torrent-session';
import type { TorrentVideoTimeline } from '../ui/MediaVideoRenderer';

// Feedback controls server production, not the player's media command queue.
export function createTorrentStream(player: YanePlayerElement) {
  let stream: {
    url: string;
    playback: Omit<TorrentVideoTimeline, 'onReplace'>;
    revision: string;
  } | null = null;
  let lifetime = new AbortController();
  let nextReport = 0;
  let reporting = false;
  let textId: string | null = null;
  let nextText = 0;
  let coverage = 0;
  let refreshing = false;
  let captionJob: AbortController | null = null;
  let applyingCaptions = false;

  function update(snapshot: PlayerEvent['snapshot']) {
    const current = stream;
    if (
      !current?.playback.timeline.continuous ||
      snapshot.source?.revision !== current.revision ||
      (snapshot.pending && snapshot.pending.type !== 'text') ||
      snapshot.positionSeconds === null
    )
      return;
    const position = snapshot.positionSeconds;
    if (!reporting && Date.now() >= nextReport) {
      nextReport = Date.now() + 2_000;
      reporting = true;
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
          reporting = false;
        });
    }
    const selected = snapshot.selection?.textId ?? null;
    if (applyingCaptions && snapshot.pending?.type === 'text' && selected === null) return;
    if (selected !== textId) {
      captionJob?.abort();
      textId = selected;
      nextText = position + 30;
      coverage = 0;
    }
    const track = current.playback.subtitleTracks?.find(
      (item) => `subtitle:${item.ref}` === selected,
    );
    if (!track || refreshing || position < nextText || snapshot.intent !== 'playing') return;
    nextText = position + 30;
    refreshing = true;
    const job = new AbortController();
    captionJob = job;
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
        end > coverage
      ) {
        coverage = end;
        // The resource is now in the backend's bounded cache. Re-selecting a
        // managed caption track updates cues without replacing or pausing video.
        applyingCaptions = true;
        try {
          await player.selectText(selected);
        } finally {
          applyingCaptions = false;
        }
      }
    })()
      .catch(() => undefined)
      .finally(() => {
        if (captionJob === job) captionJob = null;
        refreshing = false;
      });
  }
  return {
    update,
    configure(url: string, playback: Omit<TorrentVideoTimeline, 'onReplace'>, revision: string) {
      if (stream?.revision === revision) return;
      lifetime.abort();
      lifetime = new AbortController();
      stream = { url, playback, revision };
      nextReport = 0;
      textId = null;
      coverage = 0;
      nextText = 0;
    },
    dispose() {
      lifetime.abort();
      stream = null;
    },
  };
}
