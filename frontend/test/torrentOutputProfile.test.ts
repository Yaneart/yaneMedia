import { afterEach, expect, mock, test } from 'bun:test';
import { torrentOutputProfile } from '../src/entities/torrent-session/model/torrentOutputProfile';
import { startTorrentPlayback, resetTorrentClientScope } from '../src/entities/torrent-session';

const originalFetch = globalThis.fetch;
const sessionId = 'torrent_session_abcdefghijklmnopqrstuv';
const wire = {
  sessionId,
  mediaRef: null,
  state: 'awaiting_playback',
  version: 1,
  createdAt: '2026-10-30T00:00:00Z',
  expiresAt: '2026-10-31T00:00:00Z',
  idleExpiresAt: '2026-10-31T00:00:00Z',
  status: {
    progressBasisPoints: null,
    downloadSpeedBytesPerSecond: 0,
    peers: 0,
    downloadedBytes: 0,
  },
  files: [],
  selectedFileRef: null,
  audioTracks: [],
  playback: null,
  failure: null,
};

const originals = new Map(
  ['document', 'navigator', 'MediaSource'].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]),
);
afterEach(() => {
  globalThis.fetch = originalFetch;
  resetTorrentClientScope();
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});

function browser(
  decodingInfo?: (
    config: MediaDecodingConfiguration,
  ) => Promise<Partial<MediaCapabilitiesDecodingInfo>>,
  native = false,
  codecs = true,
) {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      createElement: () => ({
        canPlayType: (type: string) =>
          (type.includes('mpegurl') ? native : codecs) ? 'probably' : '',
      }),
    },
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaCapabilities: decodingInfo ? { decodingInfo } : undefined },
  });
  Object.defineProperty(globalThis, 'MediaSource', {
    configurable: true,
    value: native ? undefined : { isTypeSupported: () => codecs },
  });
}

test('negotiates supported smooth 1080p with MSE and AAC stereo', async () => {
  const decode = mock(async (_config: MediaDecodingConfiguration) => ({
    supported: true,
    smooth: true,
  }));
  browser(decode);
  expect(await torrentOutputProfile()).toBe('h264-1080p');
  expect(decode.mock.calls[0][0]).toMatchObject({
    type: 'media-source',
    video: { width: 1920, height: 1080, framerate: 30 },
    audio: { channels: '2' },
  });
});

test('uses file decoding capabilities when native HLS is available', async () => {
  const decode = mock(async (_config: MediaDecodingConfiguration) => ({
    supported: true,
    smooth: true,
  }));
  browser(decode, true);
  expect(await torrentOutputProfile()).toBe('h264-1080p');
  expect(decode.mock.calls[0][0]).toMatchObject({ type: 'file' });
});

test('prefers MSE capabilities when both native HLS and MSE are available', async () => {
  const decode = mock(async (_config: MediaDecodingConfiguration) => ({
    supported: true,
    smooth: true,
  }));
  browser(decode, true);
  Object.defineProperty(globalThis, 'MediaSource', {
    configurable: true,
    value: { isTypeSupported: () => true },
  });
  expect(await torrentOutputProfile()).toBe('h264-1080p');
  expect(decode.mock.calls[0][0]).toMatchObject({ type: 'media-source' });
});

test('falls back to smooth 720p when 1080p is unsupported or slow', async () => {
  const decode = mock(async (config: MediaDecodingConfiguration) => ({
    supported: true,
    smooth: config.video?.height === 720,
  }));
  browser(decode);
  expect(await torrentOutputProfile()).toBe('h264-720p');
  expect(decode).toHaveBeenCalledTimes(2);
});

test('keeps conservative 720p when capabilities are missing, throw or stall', async () => {
  browser();
  expect(await torrentOutputProfile()).toBe('h264-720p');
  browser(async () => {
    throw new TypeError('unimplemented');
  });
  expect(await torrentOutputProfile()).toBe('h264-720p');
  browser(() => new Promise(() => {}));
  expect(await torrentOutputProfile()).toBe('h264-720p');
});

test('rejects an explicitly unsupported codec or both decode profiles', async () => {
  browser(undefined, false, false);
  await expect(torrentOutputProfile()).rejects.toMatchObject({ code: 'TORRENT_UNSUPPORTED_MEDIA' });
  browser(async () => ({ supported: false, smooth: false }));
  await expect(torrentOutputProfile()).rejects.toMatchObject({ code: 'TORRENT_UNSUPPORTED_MEDIA' });
});

test('pins the negotiated profile across retries of a logical playback command', async () => {
  const decode = mock(async () => ({ supported: true, smooth: true }));
  browser(decode);
  const bodies: unknown[] = [];
  globalThis.fetch = mock(async (_url: unknown, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    return Response.json({ data: wire });
  }) as typeof fetch;
  const args = [
    sessionId,
    0,
    1,
    'profile-stability-20261030',
    new AbortController().signal,
  ] as const;
  await startTorrentPlayback(...args);
  browser(async () => ({ supported: false, smooth: false }));
  await startTorrentPlayback(...args);
  expect(decode).toHaveBeenCalledTimes(1);
  expect(bodies).toEqual([
    { startPositionSeconds: 0, expectedVersion: 1, outputProfile: 'h264-1080p' },
    { startPositionSeconds: 0, expectedVersion: 1, outputProfile: 'h264-1080p' },
  ]);
});

test('aborts before POST when the account changes during capability negotiation', async () => {
  let finish!: (value: Partial<MediaCapabilitiesDecodingInfo>) => void;
  browser(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const fetch = mock(async () => Response.json({ data: wire }));
  globalThis.fetch = fetch as typeof globalThis.fetch;
  const request = startTorrentPlayback(
    sessionId,
    0,
    1,
    'profile-cancel-20261030',
    new AbortController().signal,
  );
  resetTorrentClientScope();
  finish({ supported: true, smooth: true });
  await expect(request).rejects.toMatchObject({ kind: 'aborted' });
  expect(fetch).not.toHaveBeenCalled();
});
