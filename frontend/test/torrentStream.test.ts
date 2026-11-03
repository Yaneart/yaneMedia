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
  stream.update({ ...snapshot, positionSeconds: -0.042 });
  stream.update({ ...snapshot, positionSeconds: Number.NaN });
  expect(calls).toHaveLength(0);
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

test('feeds the producer while seek/audio commands wait for replacement captions', async () => {
  const fetch = mock(async () => new Response(null, { status: 204 }));
  globalThis.fetch = fetch as unknown as typeof globalThis.fetch;
  const stream = createTorrentStream({} as YanePlayerElement);
  for (const [generation, type] of [
    [2, 'seek'],
    [3, 'audio'],
  ] as const) {
    stream.configure(
      'http://localhost/hls/master.m3u8',
      {
        generation,
        timeline: { continuous: true },
      } as TorrentVideoTimeline,
      String(generation),
    );
    stream.update({
      source: { id: 'media', revision: String(generation) },
      positionSeconds: 310,
      pending: { type },
      captions: { status: 'loading' },
    } as PlayerEvent['snapshot']);
    await settle();
    expect(JSON.parse(fetch.mock.calls.at(-1)![1].body)).toEqual({
      generation,
      positionSeconds: 310,
    });
  }
  expect(fetch).toHaveBeenCalledTimes(2);
  stream.dispose();
});

test('a seek aborts prefetch immediately and a new revision does not wait for stale fetch completion', async () => {
  let snapshot = {
    source: { id: 'media', revision: 'old' },
    pending: null,
    positionSeconds: 0,
    intent: 'playing',
    selection: { textId: 'subtitle:full' },
  } as PlayerEvent['snapshot'];
  const selectText = mock(async () => {});
  const stream = createTorrentStream({
    runtime: { getSnapshot: () => snapshot },
    selectText,
  } as unknown as YanePlayerElement);
  const jobs: { signal: AbortSignal; resolve: (response: Response) => void }[] = [];
  globalThis.fetch = mock((input, init) =>
    String(input).endsWith('/progress')
      ? Promise.resolve(new Response(null, { status: 204 }))
      : new Promise<Response>((resolve) => jobs.push({ signal: init!.signal!, resolve })),
  ) as typeof fetch;
  const playback = {
    generation: 1,
    timeline: { continuous: true },
    subtitleTracks: [{ ref: 'full', url: 'http://localhost/subtitles/full' }],
  } as unknown as TorrentVideoTimeline;
  stream.configure('http://localhost/hls/master.m3u8', playback, 'old');
  stream.update(snapshot);
  stream.update((snapshot = { ...snapshot, positionSeconds: 31 }));
  expect(jobs).toHaveLength(1);
  stream.update({ ...snapshot, pending: { type: 'seek' } } as PlayerEvent['snapshot']);
  expect(jobs[0].signal.aborted).toBe(true);
  stream.configure('http://localhost/hls/master.m3u8', playback, 'new');
  stream.update((snapshot = { ...snapshot, source: { id: 'media', revision: 'new' } }));
  stream.update((snapshot = { ...snapshot, positionSeconds: 62 }));
  expect(jobs).toHaveLength(2);
  jobs[0].resolve(new Response('WEBVTT', { headers: { 'X-YaneMedia-Subtitle-End': '120' } }));
  await settle();
  expect(selectText).not.toHaveBeenCalled();
  jobs[1].resolve(new Response('WEBVTT', { headers: { 'X-YaneMedia-Subtitle-End': '180' } }));
  await settle();
  expect(selectText).toHaveBeenCalledTimes(1);
  // A backwards local seek must refresh even though the previous window ended later.
  stream.update((snapshot = { ...snapshot, positionSeconds: 5 }));
  expect(jobs).toHaveLength(3);
  jobs[2].resolve(new Response('WEBVTT', { headers: { 'X-YaneMedia-Subtitle-End': '95' } }));
  await settle();
  expect(selectText).toHaveBeenCalledTimes(2);
  stream.dispose();
});
