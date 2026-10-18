import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { AuthRepository } from '../../src/auth/auth.repository';
import { sessions } from '../../src/auth/entities/session.entity';
import { DatabaseService } from '../../src/database/database.service';
import {
  TorrentSessionConflict,
  TorrentSessionNotFound,
  TorrentSessionRepository,
} from '../../src/torrent/torrent-session.repository';
import { users } from '../../src/users/entities/user.entity';
import { eq } from 'drizzle-orm';

const describePostgres = process.env.TORRENT_POSTGRES_TEST === '1' ? describe : describe.skip;

describePostgres('torrent session PostgreSQL persistence', () => {
  let database: DatabaseService;
  let repository: TorrentSessionRepository;
  const owners: string[] = [];

  beforeAll(async () => {
    database = new DatabaseService(new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }));
    await database.onModuleInit();
    repository = new TorrentSessionRepository(database);
    for (let i = 0; i < 3; i += 1) {
      const token = randomBytes(6).toString('hex');
      const [user] = await database.db
        .insert(users)
        .values({
          handle: `torrent${token}`,
          displayName: 'Torrent test',
          email: `torrent-${token}@example.test`,
          passwordHash: 'test-only',
        })
        .returning({ id: users.id });
      owners.push(user.id);
    }
  });

  afterAll(async () => {
    if (database) {
      for (const ownerId of owners) await database.db.delete(users).where(eq(users.id, ownerId));
      await database.onApplicationShutdown();
    }
  });

  it('replays one reservation, rejects changed input, enforces global capacity and CAS transitions', async () => {
    const now = new Date();
    const first = {
      ownerId: owners[0],
      route: 'magnet',
      idempotencyKey: 'a'.repeat(16),
      inputDigest: 'b'.repeat(64),
      now,
    };
    const accepted = await repository.reserve(first);
    expect(accepted.replay).toBe(false);
    expect(accepted.session.sessionId).toMatch(/^torrent_session_[A-Za-z0-9_-]{22}$/);
    expect((await repository.reserve(first)).session.sessionId).toBe(accepted.session.sessionId);
    await expect(
      repository.reserve({ ...first, inputDigest: 'c'.repeat(64) }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    await expect(
      repository.reserve({ ...first, idempotencyKey: 'd'.repeat(16) }),
    ).rejects.toMatchObject({ code: 'TORRENT_ACTIVE_SESSION_EXISTS' });
    const second = await repository.reserve({
      ...first,
      ownerId: owners[1],
      idempotencyKey: 'e'.repeat(16),
    });
    await expect(
      repository.reserve({ ...first, ownerId: owners[2], idempotencyKey: 'f'.repeat(16) }),
    ).rejects.toMatchObject({ code: 'TORRENT_CAPACITY_EXCEEDED' });

    const next = await repository.transition(accepted.session.sessionId, 1, 'fetching_metadata');
    expect(next.version).toBe(2);
    await expect(repository.transition(next.sessionId, 1, 'awaiting_file')).rejects.toBeInstanceOf(
      TorrentSessionConflict,
    );
    await expect(repository.transition(next.sessionId, 2, 'ready')).rejects.toThrow(
      'Invalid torrent session transition',
    );
    expect(await repository.requestStop(owners[2], next.sessionId)).toBe(false);
    expect(await repository.requestStop(owners[0], next.sessionId)).toBe(true);
    expect(await repository.requestStop(owners[0], next.sessionId)).toBe(true);
    expect(await repository.findVisible(owners[0], next.sessionId)).toBeUndefined();
    await expect(repository.reserve(first)).rejects.toBeInstanceOf(TorrentSessionNotFound);

    const tokenHash = randomBytes(32).toString('hex');
    await database.db.insert(sessions).values({
      tokenHash,
      userId: owners[1],
      expiresAt: new Date(now.getTime() + 60_000),
    });
    await new AuthRepository(database).deleteByTokenHash(tokenHash);
    expect(await repository.findVisible(owners[1], second.session.sessionId)).toBeUndefined();

    const old = await repository.reserve({
      ...first,
      ownerId: owners[2],
      idempotencyKey: 'g'.repeat(16),
      now: new Date(now.getTime() - 9 * 60 * 60 * 1000),
    });
    const replacement = await repository.reserve({
      ...first,
      ownerId: owners[2],
      idempotencyKey: 'h'.repeat(16),
      now,
    });
    expect(replacement.session.sessionId).not.toBe(old.session.sessionId);
    expect(await repository.findVisible(owners[2], old.session.sessionId, now)).toBeUndefined();
  });

  it('publishes file mappings atomically with the state transition', async () => {
    const accepted = await repository.reserve({
      ownerId: owners[0],
      route: 'file',
      idempotencyKey: 'metadata-publish-1',
      inputDigest: 'a'.repeat(64),
    });
    const pending = await repository.transition(accepted.session.sessionId, 1, 'fetching_metadata');
    const file = {
      fileRef: `torrent_file_${randomBytes(16).toString('base64url')}`,
      engineFileIndex: 1,
      displayName: 'film.mkv',
      sizeBytes: 100,
    };
    const published = await repository.replaceFiles(pending.sessionId, pending.version, [file]);
    expect(published.state).toBe('probing');
    expect(published.selectedFileRef).toBe(file.fileRef);
    expect(await repository.listFiles(pending.sessionId)).toEqual([
      { fileRef: file.fileRef, displayName: 'film.mkv', sizeBytes: 100, mediaKind: 'video' },
    ]);
    await expect(
      repository.replaceFiles(pending.sessionId, pending.version, [file]),
    ).rejects.toBeInstanceOf(TorrentSessionConflict);
    expect(await repository.listFiles(pending.sessionId)).toHaveLength(1);

    await repository.requestStop(owners[0], pending.sessionId);
    const second = await repository.reserve({
      ownerId: owners[0],
      route: 'file',
      idempotencyKey: 'metadata-publish-2',
      inputDigest: 'b'.repeat(64),
    });
    const multi = await repository.transition(second.session.sessionId, 1, 'fetching_metadata');
    const awaiting = await repository.replaceFiles(multi.sessionId, multi.version, [
      { ...file, fileRef: `torrent_file_${randomBytes(16).toString('base64url')}` },
      {
        ...file,
        fileRef: `torrent_file_${randomBytes(16).toString('base64url')}`,
        engineFileIndex: 2,
      },
    ]);
    expect(awaiting.state).toBe('awaiting_file');
    expect(awaiting.selectedFileRef).toBeNull();
    expect(await repository.listFiles(multi.sessionId)).toHaveLength(2);
  });
});
