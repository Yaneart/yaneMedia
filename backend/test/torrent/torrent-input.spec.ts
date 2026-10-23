import { ConfigService } from '@nestjs/config';
import { TorrentInputService } from '../../src/torrent/torrent-input.service';
import {
  TorrentInputError,
  validateMagnet,
  validateMetainfo,
} from '../../src/torrent/torrent-input.validation';
import type { TorrentSessionRepository } from '../../src/torrent/torrent-session.repository';
import type { TorrServerClient } from '../../src/torrent/torrserver.client';
import type { MediaRegistryService } from '../../src/media/registry/media-registry.service';
import type { TorrentSessionRow } from '../../src/torrent/torrent-session.entity';

const hash = 'a'.repeat(40);
const magnet = `magnet:?xt=urn:btih:${hash}&dn=secret+title&tr=udp%3A%2F%2Ftracker.example.org%3A80`;

type Value = string | number | Value[] | Record<string, Value>;
function encode(value: Value): Buffer {
  if (typeof value === 'number') return Buffer.from(`i${value}e`);
  if (typeof value === 'string')
    return Buffer.concat([Buffer.from(`${Buffer.byteLength(value)}:`), Buffer.from(value)]);
  if (Array.isArray(value))
    return Buffer.concat([Buffer.from('l'), ...value.map(encode), Buffer.from('e')]);
  return Buffer.concat([
    Buffer.from('d'),
    ...Object.entries(value as Record<string, Value>).flatMap(([key, entry]) => [
      encode(key),
      encode(entry),
    ]),
    Buffer.from('e'),
  ]);
}

const metainfo = (info: Record<string, Value>) =>
  encode({ announce: 'udp://tracker.example.org:80', info });
const basicInfo = { name: 'movie.mkv', length: 10, 'piece length': 16, pieces: 'a'.repeat(20) };

describe('torrent input validation', () => {
  it('accepts a bounded btih magnet while removing display names before engine add', () => {
    const result = validateMagnet(magnet);
    expect(result).toContain('xt=urn%3Abtih%3A');
    expect(result).toContain('tracker.example.org');
    expect(result).not.toContain('secret');
  });

  it.each([
    `https://example.org/${hash}`,
    `magnet:?xt=urn:btmh:${hash}`,
    `magnet:?xt=urn:btih:${hash}&xs=https%3A%2F%2Fexample.org%2Ffile`,
    `magnet:?xt=urn:btih:${hash}&tr=http%3A%2F%2F127.0.0.1%2Fannounce`,
    `magnet:?xt=urn:btih:${hash}&tr=file%3A%2F%2F%2Fetc%2Fpasswd`,
    `magnet:?xt=urn:btih:${hash}&xt=urn:btih:${hash}`,
  ])('rejects an unsafe magnet', (value) => {
    expect(() => validateMagnet(value)).toThrow(TorrentInputError);
  });

  it('accepts single-file v1 metainfo regardless of MIME or filename', () => {
    expect(validateMetainfo(metainfo(basicInfo))).toBeInstanceOf(Uint8Array);
  });

  it('removes local trackers and publisher variants without changing the info dictionary', () => {
    const info = encode(basicInfo);
    const input = encode({
      announce: 'http://retracker.local/announce',
      'announce-list': [['http://retracker.local/announce'], ['udp://tracker.example.org:80']],
      publisher: 'Example',
      'publisher-url': 'https://example.org/',
      'publisher.utf-8': 'Издатель',
      'publisher-url.utf-8': 'https://example.org/',
      info: basicInfo,
    });
    const sanitized = validateMetainfo(input);
    expect(sanitized.toString()).not.toContain('retracker.local');
    expect(sanitized.toString()).not.toContain('publisher');
    expect(sanitized.toString()).toContain('tracker.example.org');
    expect(sanitized.includes(info)).toBe(true);
    expect(validateMetainfo(sanitized)).toEqual(sanitized);
  });

  it('rejects web seeds and private tracker targets in metainfo', () => {
    expect(() =>
      validateMetainfo(encode({ info: basicInfo, 'url-list': 'http://example.org/file' })),
    ).toThrow(TorrentInputError);
    expect(() =>
      validateMetainfo(encode({ info: basicInfo, announce: 'http://127.0.0.1/announce' })),
    ).toThrow(TorrentInputError);
  });

  it('rejects traversal hidden in legacy aliases and symlinks', () => {
    const hostile = [
      { ...basicInfo, name: '../escape', 'name.utf-8': 'movie.mkv' },
      { ...basicInfo, 'symlink path': ['target'] },
      {
        name: 'root',
        'piece length': 16,
        pieces: 'a'.repeat(20),
        files: [{ length: 10, path: ['..', 'escape.mkv'], 'path.utf-8': ['movie.mkv'] }],
      },
    ];
    for (const info of hostile)
      expect(() => validateMetainfo(metainfo(info))).toThrow(TorrentInputError);
  });

  it('rejects non-ASCII numeric tokens, malformed UTF-8 and excessive nesting', () => {
    const valid = metainfo(basicInfo);
    const number = valid.indexOf(Buffer.from('i10e'));
    const hostile = Buffer.from(valid);
    hostile[number + 1] = 0xb1; // ASCII decoding would mask this into the digit 1.
    expect(() => validateMetainfo(hostile)).toThrow(TorrentInputError);
    const brokenName = Buffer.from(valid);
    brokenName[valid.indexOf(Buffer.from('movie.mkv'))] = 0xff;
    expect(() => validateMetainfo(brokenName)).toThrow(TorrentInputError);
    expect(() => validateMetainfo(Buffer.from('l'.repeat(34) + 'e'.repeat(34)))).toThrow(
      TorrentInputError,
    );
    expect(() => validateMetainfo(Buffer.alloc(2 * 1024 * 1024 + 1))).toThrow(TorrentInputError);
  });

  it.each([
    { ...basicInfo, length: -1 },
    { ...basicInfo, pieces: 'short' },
    { ...basicInfo, 'meta version': 2 },
    { ...basicInfo, files: [{ length: 10, path: ['movie.mkv'] }] },
    {
      name: 'root',
      'piece length': 16,
      pieces: 'a'.repeat(20),
      files: [
        { length: 5, path: ['a.mkv'] },
        { length: 5, path: ['A.mkv'] },
      ],
    },
    {
      name: 'root',
      'piece length': 16,
      pieces: 'a'.repeat(20),
      files: [{ length: 10, path: ['..', 'a.mkv'] }],
    },
  ])('rejects invalid metainfo', (info) => {
    expect(() => validateMetainfo(metainfo(info))).toThrow(TorrentInputError);
  });
});

describe('torrent input orchestration', () => {
  const session = {
    sessionId: 'torrent_session_' + 'a'.repeat(22),
    ownerId: 'owner',
    mediaRef: null,
    state: 'created',
    version: 1,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    idleExpiresAt: new Date(Date.now() + 60_000),
    selectedFileRef: null,
    failureCode: null,
  } as TorrentSessionRow;

  it('replays the same input before rate admission or a second engine add', async () => {
    const repository = {
      findReplay: jest.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(session),
      reserve: jest.fn().mockResolvedValue({ session, replay: false }),
      listFiles: jest.fn().mockResolvedValue([]),
      getProbe: jest.fn().mockResolvedValue(undefined),
      bindEngine: jest.fn(),
      transition: jest
        .fn()
        .mockResolvedValue({ ...session, state: 'fetching_metadata', version: 2 }),
    };
    const engine = { enabled: false, addMagnet: jest.fn().mockResolvedValue(hash) };
    const config = { get: jest.fn().mockReturnValue(undefined) };
    const input = new TorrentInputService(
      config as unknown as ConfigService,
      repository as unknown as TorrentSessionRepository,
      engine as unknown as TorrServerClient,
      {} as MediaRegistryService,
    );
    // Supply a stable key without touching filesystem in the unit test.
    Reflect.set(input, 'secret', Buffer.alloc(32, 1));
    engine.enabled = true;
    const args = [
      'owner',
      'magnet',
      validateMagnet(magnet),
      undefined,
      'a'.repeat(16),
      magnet,
    ] as const;
    const first = await input.create(...args);
    const replay = await input.create(...args);
    expect(first.state).toBe('created');
    expect(replay.sessionId).toBe(first.sessionId);
    await new Promise((resolve) => setImmediate(resolve));
    expect(engine.addMagnet).toHaveBeenCalledTimes(1);
    expect(repository.reserve).toHaveBeenCalledTimes(1);
    expect(repository.transition).toHaveBeenCalledWith(session.sessionId, 1, 'fetching_metadata');
    const calls = repository.reserve.mock.calls as unknown as Array<[{ inputDigest: string }]>;
    const reserved = calls[0][0];
    expect(reserved.inputDigest).toMatch(/^[0-9a-f]{64}$/);
    await input.beforeApplicationShutdown();
    await expect(input.create(...args)).rejects.toMatchObject({ status: 503 });
  });

  it('returns only the owner session and its safe file list', async () => {
    const ready = { ...session, state: 'awaiting_file' as const };
    const repository = {
      findVisible: jest.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(ready),
      listFiles: jest.fn().mockResolvedValue([
        {
          fileRef: `torrent_file_${'a'.repeat(22)}`,
          displayName: 'film.mkv',
          sizeBytes: 100,
          mediaKind: 'video',
        },
      ]),
      getProbe: jest.fn().mockResolvedValue(undefined),
      findEngineKey: jest.fn().mockResolvedValue(undefined),
    };
    const input = new TorrentInputService(
      { get: jest.fn() } as unknown as ConfigService,
      repository as unknown as TorrentSessionRepository,
      { enabled: false } as TorrServerClient,
      {} as MediaRegistryService,
    );
    await expect(input.get('other-owner', session.sessionId)).rejects.toMatchObject({
      status: 404,
    });
    const view = await input.get('owner', session.sessionId);
    expect(view.files).toEqual([
      {
        fileRef: `torrent_file_${'a'.repeat(22)}`,
        displayName: 'film.mkv',
        sizeBytes: 100,
        mediaKind: 'video',
      },
    ]);
    expect(view.state).toBe('awaiting_file');
    expect(repository.listFiles).toHaveBeenCalledTimes(1);
  });

  it('extends the viewer lease only when the owner reads a ready session', async () => {
    const ready = { ...session, state: 'ready' as const, generation: 3 };
    const recordViewerActivity = jest.fn().mockResolvedValue(undefined);
    const repository = {
      findVisible: jest.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce(ready),
      recordViewerActivity,
      listFiles: jest.fn().mockResolvedValue([]),
      getProbe: jest.fn().mockResolvedValue(undefined),
      findEngineKey: jest.fn().mockResolvedValue(undefined),
    };
    const input = new TorrentInputService(
      { get: jest.fn() } as unknown as ConfigService,
      repository as unknown as TorrentSessionRepository,
      { enabled: false } as TorrServerClient,
      {} as MediaRegistryService,
    );
    await expect(input.get('other-owner', session.sessionId)).rejects.toMatchObject({
      status: 404,
    });
    expect(recordViewerActivity).not.toHaveBeenCalled();
    await input.get('owner', session.sessionId);
    expect(recordViewerActivity).toHaveBeenCalledWith(session.sessionId, 3);
  });

  it('recovers the active session only for a canonical media reference', async () => {
    const mediaRef = 'work_0b02a880-8fdd-43b6-92f2-7a093d9eab60';
    const repository = {
      findActiveForMedia: jest.fn().mockResolvedValueOnce(session).mockResolvedValueOnce(undefined),
      listFiles: jest.fn().mockResolvedValue([]),
      getProbe: jest.fn().mockResolvedValue(undefined),
      findEngineKey: jest.fn().mockResolvedValue(undefined),
    };
    const input = new TorrentInputService(
      { get: jest.fn() } as unknown as ConfigService,
      repository as unknown as TorrentSessionRepository,
      { enabled: false } as TorrServerClient,
      {} as MediaRegistryService,
    );
    await expect(input.getActiveForMedia('owner', 'invalid')).rejects.toMatchObject({
      status: 400,
    });
    expect((await input.getActiveForMedia('owner', mediaRef))?.sessionId).toBe(session.sessionId);
    expect(await input.getActiveForMedia('owner', mediaRef)).toBeNull();
    expect(repository.findActiveForMedia).toHaveBeenCalledWith('owner', mediaRef);
  });

  it('returns bounded live progress and keeps status available when the engine is offline', async () => {
    const active = { ...session, state: 'fetching_metadata' as const };
    const repository = {
      findVisible: jest.fn().mockResolvedValue(active),
      listFiles: jest.fn().mockResolvedValue([]),
      getProbe: jest.fn().mockResolvedValue(undefined),
      findEngineKey: jest.fn().mockResolvedValue(hash),
    };
    const engine = {
      enabled: false,
      getStatus: jest
        .fn()
        .mockResolvedValueOnce({
          loadedBytes: 500,
          totalBytes: 1_000,
          downloadBytesPerSecond: 200,
          activePeers: 3,
        })
        .mockRejectedValueOnce(new Error('offline')),
    };
    const input = new TorrentInputService(
      { get: jest.fn() } as unknown as ConfigService,
      repository as unknown as TorrentSessionRepository,
      engine as unknown as TorrServerClient,
      {} as MediaRegistryService,
    );
    const live = await input.get('owner', session.sessionId);
    expect(live.status).toEqual({
      progressBasisPoints: 5_000,
      downloadSpeedBytesPerSecond: 200,
      peers: 3,
      downloadedBytes: 500,
    });
    const offline = await input.get('owner', session.sessionId);
    expect(offline.status.progressBasisPoints).toBeNull();
    expect(offline.status.peers).toBe(0);
  });
});
