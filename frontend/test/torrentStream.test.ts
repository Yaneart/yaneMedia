import { afterEach, expect, mock, test } from 'bun:test';
import { createTorrentStream } from '../src/widgets/media-player/model/torrentStream';
import type { YanePlayerElement, PlayerEvent } from '@yaneart/yaneplayer';
import type { TorrentVideoTimeline } from '../src/widgets/media-player/ui/MediaVideoRenderer';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('continuous feedback bypasses media commands and refreshes captions only after prefetch', async () => {
  const revision = 'current';
  let snapshot = {
    source: { id: 'media', revision },
    pending: null,
    positionSeconds: 0,
    intent: 'playing',
    selection: { textId: 'subtitle:full' },
  } as PlayerEvent['snapshot'];
  const selectText = mock(async () => {});
  const player = {
    runtime: { getSnapshot: () => snapshot },
    selectText,
  } as unknown as YanePlayerElement;
  const stream = createTorrentStream(player);
  const calls: { url: string; body: any }[] = [];
  let resolveCaption!: (response: Response) => void;
  let captionSignal: AbortSignal | null = null;
  globalThis.fetch = mock((input, init) => {
    const url = String(input);
    calls.push({ url, body: init?.body ? JSON.parse(init.body as string) : undefined });
    if (!url.endsWith('/progress')) captionSignal = init?.signal ?? null;
    return url.endsWith('/progress')
      ? Promise.resolve(new Response(null, { status: 204 }))
      : new Promise<Response>((resolve) => {
          resolveCaption = resolve;
        });
  }) as typeof fetch;
  stream.configure(
    'http://localhost:3000/session/hls/master.m3u8',
    {
      generation: 7,
      timeline: { continuous: true },
      subtitleTracks: [{ ref: 'full', url: 'http://localhost:3000/subtitles/full' }],
    } as unknown as TorrentVideoTimeline,
    revision,
  );
  stream.update(snapshot);
  await settle();
  expect(calls[0]).toEqual({
    url: 'http://localhost:3000/session/hls/progress',
    body: { generation: 7, positionSeconds: 0 },
  });
  snapshot = { ...snapshot, positionSeconds: 31 };
  stream.update(snapshot);
  expect(selectText).not.toHaveBeenCalled();
  resolveCaption(new Response('WEBVTT', { headers: { 'X-YaneMedia-Subtitle-End': '120' } }));
  await settle();
  expect(selectText).toHaveBeenCalledWith('subtitle:full');
  // A selection/source changed while a background fetch was pending wins.
  snapshot = { ...snapshot, positionSeconds: 62 };
  stream.update(snapshot);
  snapshot = { ...snapshot, selection: { ...snapshot.selection, textId: null } };
  stream.update({ ...snapshot, pending: { type: 'text' } } as PlayerEvent['snapshot']);
  expect(captionSignal?.aborted).toBe(true);
  resolveCaption(new Response('WEBVTT', { headers: { 'X-YaneMedia-Subtitle-End': '180' } }));
  await settle();
  expect(selectText).toHaveBeenCalledTimes(1);
  stream.update({ ...snapshot, pending: { type: 'seek' } } as PlayerEvent['snapshot']);
  stream.update({ ...snapshot, source: { id: 'media', revision: 'stale' } });
  expect(calls.length).toBe(3);
  stream.dispose();
});

test('finite windows do not start the continuous feedback protocol', () => {
  const fetch = mock(async () => new Response(null, { status: 204 }));
  globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
  const stream = createTorrentStream({} as YanePlayerElement);
  stream.configure('http://localhost/master.m3u8', { timeline: {} } as TorrentVideoTimeline, 'old');
  stream.update({
    source: { id: 'media', revision: 'old' },
    positionSeconds: 30,
    pending: null,
  } as PlayerEvent['snapshot']);
  expect(fetch).not.toHaveBeenCalled();
  stream.dispose();
});
