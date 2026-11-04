import { afterEach, expect, mock, test } from 'bun:test';
const sharedApi = await import('../src/shared/api/index');
mock.module('@/shared/api', () => sharedApi);
const { switchTorrentFile, resetTorrentClientScope, rememberTorrentAudio } =
  await import('../src/entities/torrent-session');
const { mapTorrentSession } = await import('../src/entities/torrent-session/api/mapTorrentSession');
const originalFetch = globalThis.fetch;
const id = 'torrent_session_abcdefghijklmnopqrstuv';
const tracks = [
  { trackRef: 'new-audio', label: 'Dub', language: 'rus', channels: 2, isDefault: true },
];
const base = {
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
  selectedFileRef: 'old-file',
  audioTracks: tracks,
  failure: null,
  playback: {
    source: { type: 'hls', url: `/api/v1/torrent-sessions/${id}/hls/master.m3u8` },
    generation: 1,
    startPositionSeconds: 50,
    durationSeconds: 1000,
    selectedAudioTrackRef: 'old-audio',
    audioTracks: tracks,
    supportsSubtitleSelection: false,
    timeline: { absoluteAnchorSeconds: 50, mediaAnchorSeconds: 0, windowEndSeconds: 170 },
    playbackRates: [1],
  },
};
const probe = {
  ...base,
  selectedFileRef: 'new-file',
  version: 7,
  state: 'awaiting_playback',
  playback: null,
};
const ready = {
  ...base,
  selectedFileRef: 'new-file',
  version: 9,
  playback: {
    ...base.playback,
    generation: 3,
    selectedAudioTrackRef: 'new-audio',
    startPositionSeconds: 0,
  },
};
const response = (value: unknown) => Response.json({ data: value });
afterEach(() => {
  globalThis.fetch = originalFetch;
  resetTorrentClientScope();
});

test('ready file switch waits for probing and playback, uses fresh refs and resets the episode position', async () => {
  const calls: { method: string; body: any }[] = [];
  const progress: string[] = [];
  let gets = 0;
  rememberTorrentAudio({
    ref: 'old-audio',
    label: 'Dub',
    language: 'rus',
    channels: 2,
    isDefault: false,
  });
  globalThis.fetch = mock(async (_url: string, init: RequestInit) => {
    const method = init.method ?? 'GET';
    calls.push({ method, body: init.body ? JSON.parse(String(init.body)) : null });
    if (method === 'PUT')
      return response({ ...probe, state: 'probing', version: 6, audioTracks: [] });
    if (method === 'POST') return response({ ...probe, state: 'preparing', version: 8 });
    return response(++gets === 1 ? probe : ready);
  });
  const result = await switchTorrentFile(
    mapTorrentSession(base),
    'new-file',
    0,
    new AbortController().signal,
    (state) => progress.push(state),
  );
  expect(progress).toEqual(['probing', 'awaiting_playback', 'preparing', 'ready']);
  expect(result.playback?.generation).toBe(3);
  expect(calls.filter((call) => call.method === 'PUT').map((call) => call.body)).toEqual([
    { fileRef: 'new-file', expectedVersion: 5 },
  ]);
  expect(calls.find((call) => call.method === 'POST')?.body).toMatchObject({
    expectedVersion: 7,
    startPositionSeconds: 0,
    audioTrackRef: 'new-audio',
  });
});

test('a successor reconciles a lost file response instead of submitting its stale version again', async () => {
  const versions: number[] = [];
  let gets = 0;
  globalThis.fetch = mock(async (_url: string, init: RequestInit) => {
    if (init.method === 'PUT') {
      versions.push(JSON.parse(String(init.body)).expectedVersion);
      throw new TypeError('Response lost after admission');
    }
    if (init.method === 'POST') return response(ready);
    return response(++gets === 1 ? { ...probe, state: 'probing', version: 6 } : probe);
  });
  await switchTorrentFile(mapTorrentSession(base), 'new-file', 0, new AbortController().signal);
  expect(versions).toEqual([5]);
});

test('a rapid successor waits for an earlier probe then selects its own file with the current version', async () => {
  let put: any;
  globalThis.fetch = mock(async (_url: string, init: RequestInit) => {
    if (init.method === 'PUT') {
      put = JSON.parse(String(init.body));
      return response({ ...probe, selectedFileRef: 'third-file', version: 8 });
    }
    if (init.method === 'POST')
      return response({ ...ready, selectedFileRef: 'third-file', version: 10 });
    return response(probe);
  });
  const result = await switchTorrentFile(
    mapTorrentSession({ ...probe, state: 'probing', version: 6 }),
    'third-file',
    0,
    new AbortController().signal,
  );
  expect(put).toEqual({ fileRef: 'third-file', expectedVersion: 7 });
  expect(result.selectedFileRef).toBe('third-file');
});

test('cancellation after file admission never starts playback or returns the old episode', async () => {
  const controller = new AbortController();
  const progress = mock(() => {});
  let calls = 0;
  globalThis.fetch = mock(async () => {
    calls++;
    controller.abort();
    return response({ ...probe, state: 'probing' });
  });
  await expect(
    switchTorrentFile(mapTorrentSession(base), 'new-file', 0, controller.signal, progress),
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(calls).toBe(1);
  expect(progress).not.toHaveBeenCalled();
});

test('service failure remains an explicit retry and does not produce hidden playback mutations', async () => {
  let posts = 0;
  globalThis.fetch = mock(async () => {
    posts++;
    return Response.json(
      { error: { code: 'TORRENT_UNAVAILABLE', message: 'Unavailable' } },
      { status: 503 },
    );
  });
  await expect(
    switchTorrentFile(mapTorrentSession(probe), 'new-file', 0, new AbortController().signal),
  ).rejects.toMatchObject({ status: 503 });
  expect(posts).toBe(1);
});
