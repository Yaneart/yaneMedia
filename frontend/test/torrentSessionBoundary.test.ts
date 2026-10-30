import { afterEach, describe, expect, mock, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import { isEditorialQueryKey } from '../src/app/providers/editorialQueryPersistence';
import { clearAccountQueries } from '../src/entities/auth/model/accountQuery';

const sharedApi = await import('../src/shared/api/index');
mock.module('@/shared/api', () => sharedApi);

const {
  cacheTorrentSession,
  createFileSession,
  createMagnetSession,
  createCandidateSession,
  getTorrentCandidates,
  getActiveTorrentSession,
  getTorrentSession,
  registerTorrentPlayerStop,
  resetTorrentClientScope,
  selectTorrentFile,
  startTorrentPlayback,
  stopTorrentSession,
  torrentPollInterval,
  torrentSessionQueryKeys,
  TorrentRequestError,
} = await import('../src/entities/torrent-session');
const { mapTorrentSession } = await import('../src/entities/torrent-session/api/mapTorrentSession');

const originalFetch = globalThis.fetch;
const id = 'torrent_session_abcdefghijklmnopqrstuv';
const createdAt = '2026-10-19T12:00:00.000Z';
const wire = {
  sessionId: id,
  mediaRef: null,
  state: 'created',
  version: 1,
  createdAt,
  expiresAt: '2026-10-19T20:00:00.000Z',
  idleExpiresAt: '2026-10-19T12:20:00.000Z',
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

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetTorrentClientScope();
});

describe('torrent API boundary', () => {
  test('searches by canonical media and episode, then creates a session from an opaque candidate', async () => {
    const calls: Array<[string, RequestInit]> = [];
    const mediaRef = 'work_0b02a880-8fdd-43b6-92f2-7a093d9eab60';
    const candidateRef = 'candidate_abcdefghijklmnopqrstuvwx';
    const candidate = {
      candidateRef,
      title: 'Example S01E02 1080p',
      tracker: 'Indexer',
      stale: false,
      catalog: 'JacRed',
      size: 1234,
      seeders: 8,
      publishedAt: null,
      score: 90,
      reasons: ['episode_match'],
      quality: 'WEB-DL',
      resolution: '1080p',
      voice: null,
      studio: null,
      russianSubtitles: false,
      season: 1,
      episode: 2,
      ageDays: null,
    };
    globalThis.fetch = mock(async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return Response.json(
        {
          data:
            init.method === 'POST'
              ? { ...wire, mediaRef }
              : {
                  mediaRef,
                  candidates: [candidate],
                  degraded: false,
                  expiresInSeconds: 600,
                },
        },
        { status: init.method === 'POST' ? 202 : 200 },
      );
    }) as typeof fetch;
    const results = await getTorrentCandidates(mediaRef, 1, 2, new AbortController().signal);
    expect(results.candidates[0].candidateRef).toBe(candidateRef);
    expect(results.candidates[0].stale).toBe(false);
    expect(results.candidates[0].catalog).toBe('JacRed');
    expect(results.expiresAt).toBeGreaterThan(Date.now());
    expect(calls[0][0]).toContain(`season=1&episode=2`);
    expect(
      await createCandidateSession(
        candidateRef,
        'candidate-request-key',
        new AbortController().signal,
      ),
    ).toMatchObject({ id, mediaRef });
    expect(JSON.parse(calls[1][1].body as string)).toEqual({ candidateRef });
    expect(calls[1][1].headers).toMatchObject({
      'X-YaneMedia-CSRF': '1',
      'Idempotency-Key': 'candidate-request-key',
    });
  });

  test('rejects malformed discovery results', async () => {
    globalThis.fetch = mock(async () =>
      Response.json({
        data: {
          mediaRef: 'work_0b02a880-8fdd-43b6-92f2-7a093d9eab60',
          candidates: [{ candidateRef: 'https://tracker.example/download' }],
          degraded: false,
          expiresInSeconds: 600,
        },
      }),
    ) as typeof fetch;
    await expect(
      getTorrentCandidates(
        'work_0b02a880-8fdd-43b6-92f2-7a093d9eab60',
        undefined,
        undefined,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      kind: 'invalid_response',
    });
  });

  test('maps wire DTO and rejects arbitrary HLS URLs', () => {
    expect(
      mapTorrentSession({
        ...wire,
        status: { ...wire.status, downloadSpeedBytesPerSecond: 1234.5 },
      }).progress.speedBytesPerSecond,
    ).toBe(1234.5);
    const playback = {
      source: { type: 'hls', url: `/api/v1/torrent-sessions/${id}/hls/master.m3u8` },
      generation: 1,
      startPositionSeconds: 4,
      timeline: { absoluteAnchorSeconds: 40, mediaAnchorSeconds: 0.083333, windowEndSeconds: 160 },
      playbackRates: [0.2, 0.5, 0.7, 1, 1.2, 1.5, 1.7, 2],
      durationSeconds: 120,
      selectedAudioTrackRef: 'track-1',
      audioTracks: [
        { trackRef: 'track-1', label: 'Main', language: null, channels: 2, isDefault: true },
      ],
      supportsSubtitleSelection: false,
    };
    const subtitle = {
      trackRef: 'torrent_subtitle_abcdefghijklmnopqrstuv',
      label: 'Русский',
      language: 'rus',
      format: 'ass',
      isDefault: false,
      isForced: true,
      isSdh: false,
      available: true,
      unavailableReason: null,
      url: `/api/v1/torrent-sessions/${id}/subtitles/1/torrent_subtitle_abcdefghijklmnopqrstuv`,
      fonts: [
        {
          fontRef: 'torrent_font_abcdefghijklmnopqrstuv',
          url: `/api/v1/torrent-sessions/${id}/subtitle-fonts/1/torrent_font_abcdefghijklmnopqrstuv`,
        },
      ],
    };
    const withSubtitles = {
      ...playback,
      supportsSubtitleSelection: true,
      subtitleTracks: [subtitle],
    };
    const session = mapTorrentSession({ ...wire, state: 'ready', playback: withSubtitles });
    const output = {
      profile: 'h264-1080p',
      source: {
        codec: 'h264',
        width: 1920,
        height: 1080,
        bitDepth: 8,
        fps: 24,
        dynamicRange: 'sdr',
      },
      video: {
        codec: 'h264',
        bitDepth: 8,
        dynamicRange: 'sdr',
        width: 1920,
        height: 1080,
        fps: 24,
        mode: 'copy',
        reason: 'compatible',
      },
      audio: {
        codec: 'aac',
        sourceCodec: 'ac3',
        sourceChannels: 6,
        channels: 2,
        mode: 'transcode',
        reason: 'surround',
      },
    };
    expect(
      mapTorrentSession({ ...wire, state: 'ready', playback: { ...playback, output } }).playback
        ?.output,
    ).toEqual(output);
    for (const invalidOutput of [
      { ...output, profile: 'hevc-4k' },
      { ...output, source: { ...output.source, dynamicRange: 'hdr' } },
      { ...output, video: { ...output.video, width: 3840 } },
      { ...output, video: { ...output.video, reason: 'private path' } },
      { ...output, audio: { ...output.audio, channels: 6 } },
      { ...output, audio: { ...output.audio, sourceCodec: '<script>' } },
      { ...output, source: { ...output.source, engineUrl: 'http://internal' } },
    ])
      expect(() =>
        mapTorrentSession({ ...wire, playback: { ...playback, output: invalidOutput } }),
      ).toThrow();
    expect(session.playback?.subtitleTracks?.[0]).toMatchObject({
      ref: subtitle.trackRef,
      isForced: true,
    });
    for (const invalid of [
      { ...subtitle, url: 'https://other.example/subtitles' },
      { ...subtitle, url: subtitle.url.replace('/1/', '/2/') },
      { ...subtitle, fonts: [{ ...subtitle.fonts[0], url: 'http://other.example/font' }] },
      { ...subtitle, format: 'pgs', available: true },
    ])
      expect(() =>
        mapTorrentSession({ ...wire, playback: { ...withSubtitles, subtitleTracks: [invalid] } }),
      ).toThrow();
    expect(session.id).toBe(id);
    expect(session.playback?.hlsUrl).toEndWith('/hls/master.m3u8');
    expect(session.playback?.audioTracks[0].ref).toBe('track-1');
    expect(session.playback?.playbackRates).toEqual([0.2, 0.5, 0.7, 1, 1.2, 1.5, 1.7, 2]);
    expect(() =>
      mapTorrentSession({ ...wire, state: 'ready', playback: { ...playback, playbackRates: [0] } }),
    ).toThrow();
    const awaitingFile = mapTorrentSession({
      ...wire,
      state: 'awaiting_file',
      files: [
        {
          fileRef: 'torrent_file_abcdefghijklmnopqrstuv',
          displayName: 'Episode.mkv',
          sizeBytes: 1024,
          mediaKind: 'video',
        },
      ],
    });
    expect(awaitingFile.files[0]).toEqual({
      ref: 'torrent_file_abcdefghijklmnopqrstuv',
      name: 'Episode.mkv',
      sizeBytes: 1024,
    });
    expect(() =>
      mapTorrentSession({
        ...wire,
        playback: { ...playback, source: { type: 'hls', url: 'https://example.com/master.m3u8' } },
      }),
    ).toThrow();
  });

  test('recovers an account session and accepts an empty active result', async () => {
    const mediaRef = 'work_0b02a880-8fdd-43b6-92f2-7a093d9eab60';
    globalThis.fetch = mock(async () =>
      Response.json({ data: { ...wire, mediaRef } }),
    ) as typeof fetch;
    expect((await getActiveTorrentSession(mediaRef, new AbortController().signal))?.id).toBe(id);
    globalThis.fetch = mock(async () => Response.json({ data: null })) as typeof fetch;
    expect(await getActiveTorrentSession(mediaRef, new AbortController().signal)).toBeNull();
  });

  test('sends each command with credentials, CSRF and the supplied idempotency key', async () => {
    const calls: Array<[string, RequestInit]> = [];
    globalThis.fetch = mock(async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return init.method === 'DELETE'
        ? new Response(null, { status: 204 })
        : Response.json({ data: wire }, { status: init.method === 'GET' ? 200 : 202 });
    }) as typeof fetch;
    const signal = new AbortController().signal;
    const key = '1234567890abcdef';
    await createMagnetSession('magnet:?xt=urn:btih:abc', key, signal);
    await createFileSession(new File(['torrent'], 'sample.torrent'), key, signal);
    await getTorrentSession(id, signal);
    await selectTorrentFile(id, 'file-1', 1, signal);
    await startTorrentPlayback(id, 10, 2, key, signal, 'track-1');
    await stopTorrentSession(id, signal);

    expect(calls.map(([, init]) => init.method ?? 'GET')).toEqual([
      'POST',
      'POST',
      'GET',
      'PUT',
      'POST',
      'DELETE',
    ]);
    expect(calls.every(([, init]) => init.credentials === 'include')).toBe(true);
    expect(
      calls
        .filter(([, init]) => init.method !== undefined && init.method !== 'GET')
        .every(([, init]) => (init.headers as Record<string, string>)['X-YaneMedia-CSRF'] === '1'),
    ).toBe(true);
    expect((calls[0][1].headers as Record<string, string>)['Idempotency-Key']).toBe(key);
    expect((calls[4][1].headers as Record<string, string>)['Idempotency-Key']).toBe(key);
    expect(calls[1][1].body).toBeInstanceOf(FormData);
    expect((calls[1][1].headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  test('logout aborts a pending request and stops the registered player', async () => {
    globalThis.fetch = mock(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    ) as typeof fetch;
    const stop = mock(() => {});
    const unregister = registerTorrentPlayerStop(stop);
    const request = getTorrentSession(id, new AbortController().signal);
    resetTorrentClientScope();
    await expect(request).rejects.toMatchObject({ kind: 'aborted', code: 'ABORTED' });
    expect(stop).toHaveBeenCalledTimes(1);
    unregister();
  });

  test('normalizes API and malformed-response errors', async () => {
    globalThis.fetch = mock(async () =>
      Response.json(
        {
          error: {
            code: 'TORRENT_SESSION_CHANGED',
            message: 'Changed',
          },
        },
        { status: 409 },
      ),
    ) as typeof fetch;
    await expect(getTorrentSession(id, new AbortController().signal)).rejects.toMatchObject({
      kind: 'http',
      code: 'TORRENT_SESSION_CHANGED',
      status: 409,
    });
    globalThis.fetch = mock(async () =>
      Response.json({ data: { ...wire, files: null } }),
    ) as typeof fetch;
    await expect(getTorrentSession(id, new AbortController().signal)).rejects.toMatchObject({
      kind: 'invalid_response',
      code: 'INVALID_RESPONSE',
    });
  });

  test('polls by elapsed time and stops at user-action and terminal states', () => {
    const session = mapTorrentSession(wire);
    const fastInterval = torrentPollInterval(session, null, false, Date.parse(createdAt) + 10_000);
    expect(fastInterval).toBeGreaterThanOrEqual(800);
    expect(fastInterval).toBeLessThanOrEqual(1200);
    expect(torrentPollInterval(session, null, true, Date.parse(createdAt) + 70_000)).toBe(15_000);
    expect(torrentPollInterval({ ...session, state: 'awaiting_file' }, null, false)).toBe(false);
    for (const state of ['awaiting_playback', 'ready', 'failed'] as const)
      expect(torrentPollInterval({ ...session, state }, null, false)).toBe(false);
    expect(
      torrentPollInterval(
        session,
        new TorrentRequestError('http', 'RATE_LIMITED', 429, 20_000, 'Slow down'),
        true,
      ),
    ).toBe(20_000);
    expect(
      torrentPollInterval(
        session,
        new TorrentRequestError('http', 'AUTH_REQUIRED', 401, null, 'Login'),
        false,
      ),
    ).toBe(false);
    expect(
      torrentPollInterval(
        session,
        new TorrentRequestError('network', 'NETWORK_ERROR', null, null, 'Unavailable'),
        false,
      ),
    ).toBe(false);
  });

  test('bounds automatic retries and carries caller cancellation without poisoning later requests', async () => {
    const { torrentSessionQueryOptions } = await import('../src/entities/torrent-session');
    const { retry } = torrentSessionQueryOptions('alice@example.com', id);
    expect(typeof retry).toBe('function');
    if (typeof retry !== 'function') throw new Error('Expected retry policy');
    for (const status of [400, 401, 403, 404, 409, 429, 503])
      expect(retry(0, new TorrentRequestError('http', 'ERROR', status, null, 'Failed'))).toBe(
        false,
      );
    const networkError = new TorrentRequestError('network', 'NETWORK_ERROR', null, null, 'Failed');
    expect(retry(2, networkError)).toBe(true);
    expect(retry(3, networkError)).toBe(false);
    const aborted = new AbortController();
    aborted.abort();
    globalThis.fetch = mock(async (_url: string, init: RequestInit) => {
      init.signal?.throwIfAborted();
      return Response.json({ data: wire });
    }) as typeof fetch;
    await expect(getTorrentSession(id, aborted.signal)).rejects.toMatchObject({ kind: 'aborted' });
    expect((await getTorrentSession(id, new AbortController().signal)).id).toBe(id);
  });

  test('stores sessions only under the current account query key', () => {
    const client = new QueryClient();
    const session = mapTorrentSession(wire);
    cacheTorrentSession(client, 'alice@example.com', session);
    expect(client.getQueryData(torrentSessionQueryKeys.session('alice@example.com', id))).toEqual(
      session,
    );
    expect(
      client.getQueryData(torrentSessionQueryKeys.session('bob@example.com', id)),
    ).toBeUndefined();
    expect(isEditorialQueryKey(torrentSessionQueryKeys.session('alice@example.com', id))).toBe(
      false,
    );
    clearAccountQueries(client, 'alice@example.com');
    expect(
      client.getQueryData(torrentSessionQueryKeys.session('alice@example.com', id)),
    ).toBeUndefined();
  });
});
