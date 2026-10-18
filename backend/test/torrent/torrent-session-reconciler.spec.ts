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
  failureCode: null,
  generation: 1,
  createdAt: new Date(now.getTime() - 60_000),
  updatedAt: new Date(now.getTime() - 60_000),
  expiresAt: new Date(now.getTime() + 60_000),
  idleExpiresAt: new Date(now.getTime() + 60_000),
  cleanupAfter: null,
});

describe('torrent session reconciliation', () => {
  const listForReconciliation = jest.fn<
    ReturnType<TorrentSessionRepository['listForReconciliation']>,
    Parameters<TorrentSessionRepository['listForReconciliation']>
  >();
  const transition = jest.fn<
    ReturnType<TorrentSessionRepository['transition']>,
    Parameters<TorrentSessionRepository['transition']>
  >();
  const clearEngine = jest.fn().mockResolvedValue(undefined);
  const purgeExpiredIdempotency = jest.fn().mockResolvedValue(undefined);
  const purgeTombstones = jest.fn().mockResolvedValue(undefined);
  const listOwned = jest.fn();
  const drop = jest.fn().mockResolvedValue(undefined);
  const repository = {
    listForReconciliation,
    transition,
    clearEngine,
    purgeExpiredIdempotency,
    purgeTombstones,
  } as unknown as TorrentSessionRepository;
  const engine = { enabled: true, listOwned, drop } as unknown as TorrServerClient;

  beforeEach(() => {
    jest.clearAllMocks();
    transition.mockImplementation((_id, version, state) =>
      Promise.resolve({
        ...session(state),
        version: version + 1,
      }),
    );
  });

  it('closes admission before dropping an expired engine binding', async () => {
    const expired = { ...session('ready'), expiresAt: new Date(now.getTime() - 1) };
    listOwned.mockResolvedValue([key]);
    listForReconciliation.mockResolvedValue([{ session: expired, engineKey: key }]);
    await new TorrentSessionReconciler(repository, engine).sweep(now);
    expect(transition.mock.calls.map((call) => call[2])).toEqual(['expiring', 'expired']);
    expect(drop).toHaveBeenCalledWith(key, expect.any(AbortSignal));
    expect(clearEngine).toHaveBeenCalledWith(expired.sessionId);
  });

  it('invalidates a ready generation at startup and delays orphan cleanup', async () => {
    listOwned.mockResolvedValue([key]);
    listForReconciliation
      .mockResolvedValueOnce([{ session: session('ready'), engineKey: key }])
      .mockResolvedValue([]);
    const reconciler = new TorrentSessionReconciler(repository, engine);
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
});
