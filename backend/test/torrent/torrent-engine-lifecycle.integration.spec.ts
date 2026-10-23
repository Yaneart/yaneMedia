import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { TorrentMetrics } from '../../src/torrent/torrent-metrics';
import { TorrentSessionReconciler } from '../../src/torrent/torrent-session-reconciler';
import type { TorrentSessionRow } from '../../src/torrent/torrent-session.entity';
import type { TorrentSessionRepository } from '../../src/torrent/torrent-session.repository';
import type { TorrentStreamGateway } from '../../src/torrent/torrent-stream.gateway';
import { TorrServerClient } from '../../src/torrent/torrserver.client';

// Real HTTP adapter + reconciler. Persistence is a test double; PostgreSQL CAS/atomicity
// has a separate opt-in suite. This fixture never uses public peers or the live engine.
describe('torrent lifecycle against a fake HTTP TorrServer', () => {
  const hash = 'a'.repeat(40);
  const now = new Date('2026-10-22T12:00:00Z');
  let server: Server;
  let session: TorrentSessionRow;
  let client: TorrServerClient;
  let reconciler: TorrentSessionReconciler;
  let mode: 'no-peers' | 'files' | 'offline' = 'no-peers';
  let present: boolean;
  let bound: boolean;
  const actions: string[] = [];
  const replaceFiles = jest.fn<
    ReturnType<TorrentSessionRepository['replaceFiles']>,
    Parameters<TorrentSessionRepository['replaceFiles']>
  >();
  const gateway = {
    stop: jest.fn().mockResolvedValue(undefined),
    hasGeneration: jest.fn().mockReturnValue(false),
    cleanupStaleDirectories: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    actions.length = 0;
    mode = 'no-peers';
    present = true;
    bound = true;
    session = {
      sessionId: `torrent_session_${'b'.repeat(22)}`,
      ownerId: 'owner',
      mediaRef: null,
      state: 'fetching_metadata',
      version: 2,
      generation: 1,
      selectedFileRef: null,
      selectedAudioTrackRef: null,
      playbackPositionSeconds: null,
      failureCode: null,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + 600_000),
      idleExpiresAt: new Date(now.getTime() + 300_000),
      cleanupAfter: null,
    };
    server = createServer((req, res) => {
      void (async () => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(Buffer.from(chunk as Uint8Array));
        const body = JSON.parse(Buffer.concat(chunks).toString()) as {
          action: string;
          hash: string;
        };
        expect(req.url).toBe('/torrents');
        expect(req.headers.authorization).toBe('Basic Zml4dHVyZTpzZWNyZXQ=');
        actions.push(body.action);
        if (mode === 'offline') {
          res.writeHead(503).end('private upstream error');
          return;
        }
        const status = {
          hash,
          stat: mode === 'files' ? 3 : 1,
          torrent_size: mode === 'files' ? 300 : 0,
          active_peers: 0,
          connected_seeders: 0,
          file_stats:
            mode === 'files'
              ? [
                  { id: 1, path: 'private/path/E01.mkv', length: 100 },
                  { id: 2, path: 'private/path/E02.mp4', length: 200 },
                ]
              : [],
        };
        if (body.action === 'drop') {
          expect(body.hash).toBe(hash);
          present = false;
          res.writeHead(200).end();
        } else {
          res
            .writeHead(200, { 'content-type': 'application/json' })
            .end(JSON.stringify(body.action === 'list' ? (present ? [status] : []) : status));
        }
      })().catch(() => res.destroy());
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    client = new TorrServerClient({
      enabled: true,
      baseUrl: new URL(`http://127.0.0.1:${(server.address() as AddressInfo).port}`),
      authorization: 'Basic Zml4dHVyZTpzZWNyZXQ=',
      connectTimeoutMs: 500,
      headersTimeoutMs: 500,
      bodyTimeoutMs: 500,
      metadataTimeoutMs: 120_000,
      maxJsonBytes: 1024 * 1024,
      maxUploadBytes: 2 * 1024 * 1024,
    });
    const repository = {
      listForReconciliation: () => Promise.resolve([{ session, engineKey: bound ? hash : null }]),
      transition: jest.fn(
        (
          _id: string,
          version: number,
          state: TorrentSessionRow['state'],
          patch: Partial<TorrentSessionRow> = {},
        ) => {
          expect(version).toBe(session.version);
          session = { ...session, ...patch, state, version: version + 1 };
          return Promise.resolve(session);
        },
      ),
      replaceFiles,
      hasOtherEngineReference: () => Promise.resolve(false),
      clearEngine: () => {
        bound = false;
        return Promise.resolve();
      },
      requestStop: (owner: string) => {
        if (owner !== session.ownerId) return Promise.resolve(false);
        session = { ...session, state: 'stopping', version: session.version + 1 };
        return Promise.resolve(true);
      },
      findOwned: (owner: string) =>
        Promise.resolve(owner === session.ownerId ? session : undefined),
      findForCleanup: () => Promise.resolve({ session, engineKey: bound ? hash : null }),
      purgeExpiredIdempotency: () => Promise.resolve(),
      purgeTombstones: () => Promise.resolve(),
    } as unknown as TorrentSessionRepository;
    reconciler = new TorrentSessionReconciler(
      repository,
      client,
      gateway as unknown as TorrentStreamGateway,
      new TorrentMetrics(),
    );
  });

  afterEach(async () => {
    await reconciler?.beforeApplicationShutdown();
    server?.closeAllConnections();
    if (server?.listening) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('waits through no peers and an upstream outage, then publishes safe multi-file choices', async () => {
    await reconciler.pollMetadata(now);
    expect(session.state).toBe('fetching_metadata');
    expect(replaceFiles).not.toHaveBeenCalled();
    mode = 'offline';
    await reconciler.pollMetadata(new Date(now.getTime() + 2_000));
    expect(session.state).toBe('fetching_metadata');
    mode = 'files';
    await reconciler.pollMetadata(new Date(now.getTime() + 4_000));
    const files = replaceFiles.mock.calls[0]?.[2];
    expect(files?.[0]?.fileRef).toMatch(/^torrent_file_[A-Za-z0-9_-]{22}$/);
    expect(files).toEqual([
      expect.objectContaining({
        displayName: 'E01.mkv',
        engineFileIndex: 1,
      }),
      expect.objectContaining({ displayName: 'E02.mp4', engineFileIndex: 2 }),
    ]);
    expect(JSON.stringify(files)).not.toContain('private/path');
    expect(actions).toEqual(['get', 'get', 'get']);
  });

  it('times out metadata with no peers and cleans the failed engine on the next sweep', async () => {
    await reconciler.pollMetadata(now);
    await reconciler.pollMetadata(new Date(now.getTime() + 120_000));
    expect(session.state).toBe('failed');
    expect(session.failureCode).toBe('TORRENT_METADATA_TIMEOUT');
    expect(actions).toEqual(['get']);
    await reconciler.sweep(new Date(now.getTime() + 121_000));
    expect(present).toBe(false);
    expect(bound).toBe(false);
    expect(gateway.stop).toHaveBeenCalledWith(session.sessionId);
  });

  it('rejects a foreign stop and retries deferred owner cleanup when the engine recovers', async () => {
    await expect(reconciler.stop('other', session.sessionId)).rejects.toMatchObject({
      status: 404,
    });
    expect(actions).toHaveLength(0);
    mode = 'offline';
    await reconciler.stop('owner', session.sessionId);
    expect(session.state).toBe('stopping');
    expect(bound).toBe(true);
    mode = 'files';
    await reconciler.sweep(now);
    expect(session.state).toBe('stopped');
    expect(bound).toBe(false);
    expect(actions.filter((action) => action === 'drop')).toHaveLength(1);
  });

  it('invalidates pre-restart HLS before reuse and expires the idle session', async () => {
    session = { ...session, state: 'ready' };
    mode = 'files';
    await reconciler.sweep(now);
    expect(session.state).toBe('awaiting_playback');
    expect(session.generation).toBe(2);
    expect(present).toBe(true);
    await reconciler.sweep(new Date(now.getTime() + 300_000));
    expect(session.state).toBe('expired');
    expect(bound).toBe(false);
    expect(present).toBe(false);
  });
});
