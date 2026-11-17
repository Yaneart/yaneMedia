import { createRoot } from 'react-dom/client';
import { useState } from 'react';
import { MediaVideoRenderer } from '../../src/widgets/media-player/ui/MediaVideoRenderer';
import { mapTorrentSession } from '../../src/entities/torrent-session/api/mapTorrentSession';
import { replaceTorrentPlayback } from '../../src/entities/torrent-session/model/replaceTorrentPlayback';
import { stopTorrentSession } from '../../src/entities/torrent-session/api/torrentSessionApi';
import { createLocalPlayback } from '../../src/features/companion/model/localPlayback';
import { hello } from '../../src/features/companion/api/companionClient';
import {
  closeLocalController,
  heartbeatLocalController,
} from '../../src/features/companion/api/companionAdmission';
import { version } from '@yaneart/yaneplayer';

const review = ((window as any).review = {
  version,
  ready: false,
  errors: [],
  progress: [],
  player: () => document.querySelector('yane-player'),
});
const stand = await fetch('/review-info').then((r) => r.json());
const root = createRoot(document.getElementById('root')!);
const lifetime = new AbortController();
const common = {
  mediaTitle: 'Rendition integration',
  shouldAutoPlay: true,
  initialPositionSeconds: 14,
  onReady: () => {
    review.ready = true;
  },
  onError: () => review.errors.push('player'),
  onProgress: (...args: unknown[]) => review.progress.push(args),
  onPlay: () => {},
  onPause: () => {},
};

if (stand.mode === 'public') {
  const handshake = await hello(lifetime.signal);
  const controller = {
    token: stand.token,
    bootId: handshake.bootId,
    capabilities: handshake.capabilities,
  };
  const adapter = createLocalPlayback(controller, stand.sessionId, lifetime.signal);
  const { playback } = await adapter.prepare(stand.fileRef, 14, lifetime.signal);
  review.source = playback.source;
  const heartbeat = setInterval(() => {
    void heartbeatLocalController(controller, lifetime.signal).catch(() => {});
  }, 20_000);
  review.stop = async () => {
    clearInterval(heartbeat);
    root.unmount();
    lifetime.abort();
    await closeLocalController(controller);
  };
  root.render(
    <MediaVideoRenderer
      {...common}
      source={{
        sourceRef: 'local-review',
        kind: 'hls',
        provider: 'torrent',
        label: 'Fixture',
        url: playback.source.url,
        availability: 'available',
        browserSupported: true,
      }}
      localPlayback={playback}
    />,
  );
} else {
  const response = await fetch(`/api/v1/torrent-sessions/${stand.sessionId}`).then((r) => r.json());
  const initial = await replaceTorrentPlayback(
    mapTorrentSession(response.data),
    14,
    lifetime.signal,
  );
  function Home() {
    const [current, setCurrent] = useState(initial);
    review.source = current.playback;
    const playback = current.playback!;
    const replace = async (
      position: number,
      signal: AbortSignal,
      audio?: string,
      audioOnly = false,
    ) => {
      const ready = await replaceTorrentPlayback(
        current,
        position,
        signal,
        audio,
        true,
        undefined,
        audioOnly,
      );
      signal.throwIfAborted();
      setCurrent(ready);
      return ready;
    };
    review.stop = async () => {
      root.unmount();
      lifetime.abort();
      await stopTorrentSession(current.id, AbortSignal.timeout(5000));
    };
    return (
      <MediaVideoRenderer
        {...common}
        source={{
          sourceRef: `torrent:${current.id}:${playback.generation}`,
          kind: 'hls',
          provider: 'torrent',
          label: 'Fixture',
          url: playback.hlsUrl,
          availability: 'available',
          browserSupported: true,
        }}
        torrentTimeline={{ ...playback, onReplace: replace }}
      />
    );
  }
  root.render(<Home />);
}
