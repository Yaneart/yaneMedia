import { afterEach, expect, mock, test } from 'bun:test';
const sharedApi = await import('../src/shared/api/index');
mock.module('@/shared/api', () => sharedApi);
const { replaceTorrentPlayback, resetTorrentClientScope } =
  await import('../src/entities/torrent-session');
const { mapTorrentSession } = await import('../src/entities/torrent-session/api/mapTorrentSession');
const originalFetch = globalThis.fetch;
const id = 'torrent_session_abcdefghijklmnopqrstuv';
const wire = {
  sessionId: id,
  mediaRef: null,
  state: 'ready',
  version: 5,
  createdAt: new Date().toISOString(),
  expiresAt: new Date().toISOString(),
  idleExpiresAt: new Date().toISOString(),
  status: {
    progressBasisPoints: null,
    downloadSpeedBytesPerSecond: 0,
    peers: 0,
    downloadedBytes: 0,
  },
  files: [],
  selectedFileRef: 'file',
  audioTracks: [],
  failure: null,
  playback: {
    source: { type: 'hls', url: `/api/v1/torrent-sessions/${id}/hls/master.m3u8` },
    generation: 1,
    startPositionSeconds: 0,
    durationSeconds: 1000,
    selectedAudioTrackRef: 'audio',
    audioTracks: [],
    supportsSubtitleSelection: false,
    timeline: { absoluteAnchorSeconds: 0, mediaAnchorSeconds: 0.083, windowEndSeconds: 120 },
    playbackRates: [1, 2],
  },
};
const ready = {
  ...wire,
  version: 7,
  playback: {
    ...wire.playback,
    generation: 2,
    startPositionSeconds: 350,
    timeline: { absoluteAnchorSeconds: 348, mediaAnchorSeconds: 0.096, windowEndSeconds: 468 },
  },
};
const response = (value: unknown) => Response.json({ data: value });
afterEach(() => {
  globalThis.fetch = originalFetch;
  resetTorrentClientScope();
});

test('reconciles a lost POST response with the same key and waits beyond admission', async () => {
  const keys: string[] = [];
  let gets = 0;
  globalThis.fetch = mock(async (_url: string, init: RequestInit) => {
    if (init.method === 'POST') {
      keys.push(new Headers(init.headers).get('Idempotency-Key')!);
      if (keys.length === 1) throw new TypeError('Response lost after admission');
      return response(ready);
    }
    return response(
      ++gets === 1 ? { ...wire, version: 6, state: 'preparing', playback: null } : ready,
    );
  });
  const result = await replaceTorrentPlayback(
    mapTorrentSession(wire),
    350,
    new AbortController().signal,
  );
  expect(result.playback?.generation).toBe(2);
  expect(gets).toBe(2);
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBe(keys[1]);
});

test('reconciles an admitted mutation before rejecting a cancelled command', async () => {
  const abort = new AbortController();
  let gets = 0;
  globalThis.fetch = mock(async (_url: string, init: RequestInit) => {
    if (init.method === 'POST') {
      abort.abort();
      return response({ ...wire, state: 'preparing', version: 6, playback: null });
    }
    gets++;
    return response(ready);
  });
  await expect(
    replaceTorrentPlayback(mapTorrentSession(wire), 350, abort.signal),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(gets).toBe(1);
});

test('recovers a CAS conflict without changing the logical retry key', async () => {
  const bodies: any[] = [];
  const keys: string[] = [];
  globalThis.fetch = mock(async (_url: string, init: RequestInit) => {
    if (init.method !== 'POST') return response({ ...wire, version: 8 });
    bodies.push(JSON.parse(String(init.body)));
    keys.push(new Headers(init.headers).get('Idempotency-Key')!);
    return bodies.length === 1
      ? Response.json(
          { error: { code: 'TORRENT_SESSION_CHANGED', message: 'Conflict' } },
          { status: 409 },
        )
      : response({ ...ready, version: 10 });
  });
  await replaceTorrentPlayback(mapTorrentSession(wire), 350, new AbortController().signal);
  expect(bodies.map((body) => body.expectedVersion)).toEqual([5, 8]);
  expect(keys[0]).toBe(keys[1]);
});

test('rejects a newer foreign generation instead of confirming the target as viewed', async () => {
  globalThis.fetch = mock(async (_url: string, init: RequestInit) =>
    response(
      init.method === 'POST'
        ? { ...wire, state: 'preparing', version: 6, playback: null }
        : { ...ready, version: 9, playback: { ...ready.playback, startPositionSeconds: 800 } },
    ),
  );
  await expect(
    replaceTorrentPlayback(mapTorrentSession(wire), 350, new AbortController().signal),
  ).rejects.toThrow('generation replaced');
});
