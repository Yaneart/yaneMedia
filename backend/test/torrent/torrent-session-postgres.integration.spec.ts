import { TorrentMetrics } from '../../src/torrent/torrent-metrics';
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
import type { EngineTorrentKey } from '../../src/torrent/torrent-engine.port';

const describePostgres = process.env.TORRENT_POSTGRES_TEST === '1' ? describe : describe.skip;

describePostgres('torrent session PostgreSQL persistence', () => {
  const metrics = new TorrentMetrics();
  let database: DatabaseService;
  let repository: TorrentSessionRepository;
  const owners: string[] = [];

  beforeAll(async () => {
    database = new DatabaseService(new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }));
    await database.onModuleInit();
    repository = new TorrentSessionRepository(database, metrics);
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
    const engineKey = 'a'.repeat(40) as EngineTorrentKey;
    await repository.bindEngine(next.sessionId, engineKey);
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
    expect((await repository.findOwned(owners[0], next.sessionId))?.state).toBe('stopping');
    expect((await repository.findForCleanup(next.sessionId))?.engineKey).toBe(engineKey);
    expect(await repository.hasOtherEngineReference(next.sessionId, engineKey)).toBe(false);
    expect(await repository.findOwned(owners[1], next.sessionId)).toBeUndefined();
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
    expect(await metrics.registry.metrics()).toContain('torrent_time_to_metadata_seconds_count 1');
    expect(await repository.countByState()).toContainEqual({ state: 'probing', count: 1 });
    expect(published.state).toBe('probing');
    expect(published.selectedFileRef).toBe(file.fileRef);
    expect(await repository.listFiles(pending.sessionId)).toEqual([
      { fileRef: file.fileRef, displayName: 'film.mkv', sizeBytes: 100, mediaKind: 'video' },
    ]);
    await expect(
      repository.replaceFiles(pending.sessionId, pending.version, [file]),
    ).rejects.toBeInstanceOf(TorrentSessionConflict);
    expect(await repository.listFiles(pending.sessionId)).toHaveLength(1);
    expect(await metrics.registry.metrics()).toContain('torrent_time_to_metadata_seconds_count 1');

    const probe = {
      fileRef: file.fileRef,
      durationSeconds: 42.5,
      videoStreamIndex: 0,
      copyVideo: true,
      video: {
        codec: 'h264',
        profile: 'High',
        pixelFormat: 'yuv420p',
        bitDepth: 8,
        width: 1920,
        height: 1080,
        fps: 24,
        level: 41,
        bitrate: 6_000_000,
      },
      audioTracks: [
        {
          trackRef: `torrent_track_${randomBytes(16).toString('base64url')}`,
          streamIndex: 1,
          label: 'English',
          language: 'eng',
          channels: 2,
          isDefault: true,
          copy: true,
        },
        {
          trackRef: `torrent_track_${randomBytes(16).toString('base64url')}`,
          streamIndex: 2,
          label: 'Dub',
          language: 'rus',
          channels: 2,
          isDefault: false,
          copy: true,
        },
      ],
    };
    await repository.saveProbe(pending.sessionId, published.version, probe);
    const prepared = await repository.findVisible(owners[0], pending.sessionId);
    expect(prepared?.state).toBe('awaiting_playback');
    expect((await repository.getProbe(pending.sessionId))?.audioTracks[0].trackRef).toBe(
      probe.audioTracks[0].trackRef,
    );
    await expect(
      repository.beginPlayback(
        owners[0],
        pending.sessionId,
        prepared!.version,
        'torrent_track_unknown',
        0,
        'playback-invalid-1',
        'e'.repeat(64),
      ),
    ).rejects.toBeInstanceOf(TorrentSessionNotFound);
    await expect(
      repository.beginPlayback(
        owners[0],
        pending.sessionId,
        prepared!.version,
        probe.audioTracks[0].trackRef,
        42.5,
        'playback-invalid-2',
        'f'.repeat(64),
      ),
    ).rejects.toBeInstanceOf(TorrentSessionNotFound);
    const command = [
      owners[0],
      pending.sessionId,
      prepared!.version,
      probe.audioTracks[0].trackRef,
      1.5,
      'playback-command-1',
      'c'.repeat(64),
    ] as const;
    const started = await repository.beginPlayback(...command);
    expect(started.session.state).toBe('preparing');
    expect(started.session.playbackPositionSeconds).toBe(1.5);
    expect(await repository.getProbe(pending.sessionId)).toMatchObject({
      outputProfile: 'h264-720p',
      copyVideo: false,
    });
    expect((await repository.beginPlayback(...command)).replay).toBe(true);
    const timeline = { absoluteAnchorSeconds: 0, mediaAnchorSeconds: 0.08, windowEndSeconds: 42.5 };
    let ready = await repository.transition(pending.sessionId, started.session.version, 'ready', {
      playbackTimeline: timeline,
    });
    expect((await repository.findVisible(owners[0], pending.sessionId))?.playbackTimeline).toEqual(
      timeline,
    );
    await expect(
      repository.transition(pending.sessionId, started.session.version, 'ready'),
    ).rejects.toBeInstanceOf(TorrentSessionConflict);
    expect(await metrics.registry.metrics()).toContain(
      'torrent_time_to_first_frame_ready_seconds_count 1',
    );
    const switchCommand = [
      owners[0],
      pending.sessionId,
      ready.version,
      probe.audioTracks[1].trackRef,
      1.5,
      'playback-audio-1',
      'a'.repeat(64),
    ] as const;
    const [switched, replayed] = await Promise.all([
      repository.beginPlayback(...switchCommand),
      repository.beginPlayback(...switchCommand),
    ]);
    expect(switched.session.generation).toBe(ready.generation + 1);
    expect(replayed.replay).toBe(true);
    expect(replayed.session.generation).toBe(switched.session.generation);
    expect(switched.session.selectedAudioTrackRef).toBe(probe.audioTracks[1].trackRef);
    expect(switched.session.playbackPositionSeconds).toBe(1.5);
    await expect(
      repository.beginPlayback(
        owners[0],
        pending.sessionId,
        ready.version,
        probe.audioTracks[0].trackRef,
        1.5,
        'playback-audio-2',
        'b'.repeat(64),
      ),
    ).rejects.toMatchObject({ code: 'TORRENT_SESSION_CHANGED' });
    ready = await repository.transition(pending.sessionId, switched.session.version, 'ready', {
      playbackTimeline: timeline,
    });
    const profileCommand = [
      owners[0],
      pending.sessionId,
      ready.version,
      probe.audioTracks[1].trackRef,
      1.5,
      'playback-profile-1',
      '9'.repeat(64),
      'h264-1080p',
    ] as const;
    const profileChanged = await repository.beginPlayback(...profileCommand);
    expect(profileChanged.session.generation).toBe(ready.generation + 1);
    expect(await repository.getProbe(pending.sessionId)).toMatchObject({
      outputProfile: 'h264-1080p',
      copyVideo: true,
    });
    expect((await repository.beginPlayback(...profileCommand)).replay).toBe(true);
    await expect(
      repository.beginPlayback(
        owners[0],
        pending.sessionId,
        ready.version,
        probe.audioTracks[1].trackRef,
        1.5,
        'playback-profile-1',
        '8'.repeat(64),
        'h264-720p',
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
    await expect(
      repository.beginPlayback(
        owners[0],
        pending.sessionId,
        ready.version,
        probe.audioTracks[1].trackRef,
        1.5,
        'playback-profile-2',
        '7'.repeat(64),
        'h264-720p',
      ),
    ).rejects.toMatchObject({ code: 'TORRENT_SESSION_CHANGED' });
    expect(await repository.getProbe(pending.sessionId)).toMatchObject({
      outputProfile: 'h264-1080p',
      copyVideo: true,
    });
    ready = await repository.transition(
      pending.sessionId,
      profileChanged.session.version,
      'ready',
      { playbackTimeline: timeline },
    );
    await repository.transition(pending.sessionId, ready.version, 'awaiting_playback', {
      failureCode: 'TORRENT_TRANSCODE_FAILED',
    });
    expect(await metrics.registry.metrics()).toContain(
      'torrent_failures_total{code="TORRENT_TRANSCODE_FAILED"} 1',
    );
    await expect(
      repository.beginPlayback(
        owners[0],
        pending.sessionId,
        prepared!.version,
        probe.audioTracks[0].trackRef,
        1.5,
        'playback-command-1',
        'd'.repeat(64),
      ),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });

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
    await expect(
      repository.selectFile(owners[0], multi.sessionId, 'torrent_file_unknown', awaiting.version),
    ).rejects.toBeInstanceOf(TorrentSessionNotFound);
    const choice = (await repository.listFiles(multi.sessionId))[1];
    const selected = await repository.selectFile(
      owners[0],
      multi.sessionId,
      choice.fileRef,
      awaiting.version,
    );
    expect(selected.state).toBe('probing');
    expect(selected.selectedFileRef).toBe(choice.fileRef);
  });
});
