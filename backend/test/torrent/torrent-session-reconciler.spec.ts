import { TorrentMetrics } from '../../src/torrent/torrent-metrics';
import { TorrentSessionReconciler } from '../../src/torrent/torrent-session-reconciler';
import type { TorrentSessionRepository } from '../../src/torrent/torrent-session.repository';
import type { TorrServerClient } from '../../src/torrent/torrserver.client';
import type { TorrentSessionRow } from '../../src/torrent/torrent-session.entity';
import type { EngineTorrentKey } from '../../src/torrent/torrent-engine.port';

const now = new Date('2026-10-18T12:00:00Z');
const key = 'a'.repeat(40) as EngineTorrentKey;
const session = (state: TorrentSessionRow['state']): TorrentSessionRow => ({
  sessionId: 'torrent_session_aaaaaaaaaaaaaaaaaaaaaa',
  ownerId: '4f056070-8c3d-4ca8-8012-95dc2195623e',
  mediaRef: null,
  state,
  version: 3,
  selectedFileRef: null,
  selectedAudioTrackRef: null,
  playbackPositionSeconds: null,
  failureCode: null,
  generation: 1,
  createdAt: new Date(now.getTime() - 60_000),
  updatedAt: new Date(now.getTime() - 60_000),
  expiresAt: new Date(now.getTime() + 60_000),
  idleExpiresAt: new Date(now.getTime() + 60_000),
  cleanupAfter: null,
});

describe('torrent session reconciliation', () => {
  const metrics = new TorrentMetrics();
  const listForReconciliation = jest.fn<
    ReturnType<TorrentSessionRepository['listForReconciliation']>,
    Parameters<TorrentSessionRepository['listForReconciliation']>
  >();
  const transition = jest.fn<
    ReturnType<TorrentSessionRepository['transition']>,
    Parameters<TorrentSessionRepository['transition']>
  >();
  const clearEngine = jest.fn().mockResolvedValue(undefined);
  const hasOtherEngineReference = jest.fn().mockResolvedValue(false);
  const requestStop = jest.fn().mockResolvedValue(true);
  const findOwned = jest.fn();
  const findForCleanup = jest.fn();
  const purgeExpiredIdempotency = jest.fn().mockResolvedValue(undefined);
  const purgeTombstones = jest.fn().mockResolvedValue(undefined);
  const listOwned = jest.fn();
  const drop = jest.fn().mockResolvedValue(undefined);
  const replaceFiles = jest.fn().mockResolvedValue(undefined);
  const getStatus = jest.fn();
  const repository = {
    listForReconciliation,
    transition,
    replaceFiles,
    clearEngine,
    hasOtherEngineReference,
    requestStop,
    findOwned,
    findForCleanup,
    purgeExpiredIdempotency,
    purgeTombstones,
  } as unknown as TorrentSessionRepository;
  const engine = {
    enabled: true,
    metadataTimeoutMs: 120_000,
    listOwned,
    drop,
    getStatus,
  } as unknown as TorrServerClient;
  const hasGeneration = jest.fn().mockReturnValue(false);
  const gateway = {
    stop: jest.fn().mockResolvedValue(undefined),
    hasGeneration,
    cleanupStaleDirectories: jest.fn().mockResolvedValue(undefined),
  } as never;

  beforeEach(() => {
    metrics.registry.resetMetrics();
    jest.clearAllMocks();
    listForReconciliation.mockReset();
    hasOtherEngineReference.mockResolvedValue(false);
    transition.mockImplementation((_id, version, state) =>
      Promise.resolve({
        ...session(state),
        version: version + 1,
      }),
    );
  });

  it('stops an owned session immediately and remains idempotent', async () => {
    const stopping = session('stopping');
    findForCleanup.mockResolvedValue({ session: stopping, engineKey: key });
    listOwned.mockResolvedValue([key]);
    const reconciler = new TorrentSessionReconciler(repository, engine, gateway, metrics);
    await reconciler.stop(stopping.ownerId, stopping.sessionId);
    expect(gateway.stop).toHaveBeenCalledWith(stopping.sessionId);
    expect(drop).toHaveBeenCalledWith(key, expect.any(AbortSignal));
    expect(transition).toHaveBeenCalledWith(
      stopping.sessionId,
      stopping.version,
      'stopped',
      { cleanupAfter: null },
      expect.any(Date),
    );
    requestStop.mockResolvedValueOnce(false);
    findOwned.mockResolvedValueOnce(session('stopped'));
    await expect(reconciler.stop(stopping.ownerId, stopping.sessionId)).resolves.toBeUndefined();
  });

  it('preserves another session’s engine reference during stop', async () => {
    const stopping = session('stopping');
    findForCleanup.mockResolvedValue({ session: stopping, engineKey: key });
    listOwned.mockResolvedValue([key]);
    hasOtherEngineReference.mockResolvedValue(true);
    await new TorrentSessionReconciler(repository, engine, gateway, metrics).stop(
      stopping.ownerId,
      stopping.sessionId,
    );
    expect(drop).not.toHaveBeenCalled();
    expect(clearEngine).toHaveBeenCalledWith(stopping.sessionId);
  });

  it('retains the stopping audit and retries after TorrServer returns', async () => {
    const stopping = session('stopping');
    findForCleanup.mockResolvedValue({ session: stopping, engineKey: key });
    listOwned.mockRejectedValueOnce(new Error('unavailable')).mockResolvedValueOnce([key]);
    const reconciler = new TorrentSessionReconciler(repository, engine, gateway, metrics);
    await reconciler.stop(stopping.ownerId, stopping.sessionId);
    expect(clearEngine).not.toHaveBeenCalled();
    expect(await metrics.registry.metrics()).toContain(
      'torrent_cleanup_total{result="deferred"} 1',
    );
    expect(transition).not.toHaveBeenCalled();
    listForReconciliation.mockResolvedValue([{ session: stopping, engineKey: key }]);
    await reconciler.sweep(now);
    expect(await metrics.registry.metrics()).toContain('torrent_cleanup_total{result="success"} 1');
    expect(transition).toHaveBeenCalledWith(
      stopping.sessionId,
      stopping.version,
      'stopped',
      { cleanupAfter: null },
      now,
    );
  });

  it('closes admission before dropping an expired engine binding', async () => {
    const expired = { ...session('ready'), expiresAt: new Date(now.getTime() - 1) };
    listOwned.mockResolvedValue([key]);
    listForReconciliation.mockResolvedValue([{ session: expired, engineKey: key }]);
    await new TorrentSessionReconciler(repository, engine, gateway, metrics).sweep(now);
    expect(transition.mock.calls.map((call) => call[2])).toEqual(['expiring', 'expired']);
    expect(drop).toHaveBeenCalledWith(key, expect.any(AbortSignal));
    expect(clearEngine).toHaveBeenCalledWith(expired.sessionId);
  });

  it('invalidates a ready generation at startup and delays orphan cleanup', async () => {
    listOwned.mockResolvedValue([key]);
    listForReconciliation
      .mockResolvedValueOnce([{ session: session('ready'), engineKey: key }])
      .mockResolvedValue([]);
    const reconciler = new TorrentSessionReconciler(repository, engine, gateway, metrics);
    await reconciler.sweep(now);
    expect(transition).toHaveBeenCalledWith(
      session('ready').sessionId,
      3,
      'awaiting_playback',
      { generation: 2 },
      now,
    );
    await reconciler.sweep(new Date(now.getTime() + 60_000));
    expect(drop).not.toHaveBeenCalled();
    await reconciler.sweep(new Date(now.getTime() + 181_000));
    expect(drop).toHaveBeenCalledTimes(1);
  });

  it('publishes completed metadata and selects a single video', async () => {
    listForReconciliation.mockResolvedValue([
      { session: session('fetching_metadata'), engineKey: key },
    ]);
    getStatus.mockResolvedValue({
      state: 'working',
      totalBytes: 100,
      files: [{ key: 1, path: 'film.mkv', length: 100 }],
    });
    await new TorrentSessionReconciler(repository, engine, gateway, metrics).pollMetadata(now);
    const calls = replaceFiles.mock.calls as unknown as Array<
      Parameters<TorrentSessionRepository['replaceFiles']>
    >;
    const mapped = calls[0]?.[2];
    expect(mapped?.[0]?.fileRef).toMatch(/^torrent_file_[A-Za-z0-9_-]{22}$/);
    expect(replaceFiles).toHaveBeenCalledWith(
      session('fetching_metadata').sessionId,
      3,
      [
        {
          fileRef: mapped?.[0]?.fileRef,
          engineFileIndex: 1,
          displayName: 'film.mkv',
          sizeBytes: 100,
        },
      ],
      now,
    );
  });

  it('invalidates ready playback when its FFmpeg generation disappears', async () => {
    listOwned.mockResolvedValue([key]);
    listForReconciliation
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ session: session('ready'), engineKey: key }]);
    const reconciler = new TorrentSessionReconciler(repository, engine, gateway, metrics);
    await reconciler.sweep(now);
    await reconciler.sweep(new Date(now.getTime() + 1_000));
    expect(hasGeneration).toHaveBeenCalledWith(session('ready').sessionId, 1);
    expect(transition).toHaveBeenCalledWith(
      session('ready').sessionId,
      3,
      'awaiting_playback',
      { generation: 2, failureCode: 'TORRENT_TRANSCODE_FAILED' },
      new Date(now.getTime() + 1_000),
    );
  });

  it('fails metadata after the configured deadline without querying engine', async () => {
    listForReconciliation.mockResolvedValue([
      {
        session: { ...session('fetching_metadata'), updatedAt: new Date(now.getTime() - 120_000) },
        engineKey: key,
      },
    ]);
    await new TorrentSessionReconciler(repository, engine, gateway, metrics).pollMetadata(now);
    expect(getStatus).not.toHaveBeenCalled();
    expect(transition).toHaveBeenCalledWith(
      session('fetching_metadata').sessionId,
      3,
      'failed',
      { failureCode: 'TORRENT_METADATA_TIMEOUT' },
      now,
    );
  });
});
