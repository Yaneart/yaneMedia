import { randomBytes } from 'node:crypto';
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import cookieParser from 'cookie-parser';
import { eq } from 'drizzle-orm';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DatabaseService } from '../../src/database/database.service';
import { AuthRepository } from '../../src/auth/auth.repository';
import { users } from '../../src/users/entities/user.entity';
import { sessions } from '../../src/auth/entities/session.entity';
import { hashToken } from '../../src/auth/token';
import { TorrentSessionRepository } from '../../src/torrent/torrent-session.repository';
import { TorrentInputService } from '../../src/torrent/torrent-input.service';
import { TorrentPlaybackService } from '../../src/torrent/torrent-playback.service';
import { TorrentInputController } from '../../src/torrent/torrent-input.controller';
import { TorrentHlsController } from '../../src/torrent/torrent-hls.controller';
import { TorrentHlsService } from '../../src/torrent/torrent-hls.service';
import { TorrentSessionReconciler } from '../../src/torrent/torrent-session-reconciler';
import { TorrentMetrics } from '../../src/torrent/torrent-metrics';
import { TorrentBudgets } from '../../src/torrent/torrent-security';
import { ApiResponseInterceptor } from '../../src/platform/http/api-response/api-response.interceptor';
import { ApiExceptionFilter } from '../../src/platform/http/api-error/api-exception/api-exception.filter';
import type { AppLogger } from '../../src/platform/logging/app-logger';
import type { TorrServerClient } from '../../src/torrent/torrserver.client';
import type { MediaRegistryService } from '../../src/media/registry/media-registry.service';
import type { TorrentStreamGateway } from '../../src/torrent/torrent-stream.gateway';
import type { TorrentSource } from '../../src/torrent/torrent-audio-renditions';
import type { TorrentProbe } from '../../src/torrent/torrent-media-policy';

// Opt-in stand: actual controllers/auth/CSRF/repository/HLS/FFmpeg, isolated PG
// and a local generated file in place of the swarm. No normal account or engine.
export async function serveHomeRenditionBrowser(
  gateway: TorrentStreamGateway,
  engine: TorrServerClient,
  source: TorrentSource,
  raw: TorrentProbe,
  root: string,
): Promise<void> {
  const directory = process.env.TORRENT_RENDITION_BROWSER!;
  const secret = join(root, 'secret');
  await writeFile(secret, randomBytes(32).toString('base64'));
  const config = new ConfigService({
    DATABASE_URL: process.env.DATABASE_URL,
    FRONTEND_ORIGIN: 'http://localhost:5173',
    TORRENT_IDEMPOTENCY_SECRET_FILE: secret,
  });
  const database = new DatabaseService(config);
  await database.onModuleInit();
  const metrics = new TorrentMetrics();
  const repository = new TorrentSessionRepository(database, metrics);
  const stamp = randomBytes(8).toString('hex');
  const [owner] = await database.db
    .insert(users)
    .values({
      handle: `audio${stamp}`,
      displayName: 'Audio fixture',
      email: `audio-${stamp}@example.test`,
      passwordHash: 'fixture',
      emailVerifiedAt: new Date(),
    })
    .returning();
  const cookie = randomBytes(32).toString('base64url');
  await database.db
    .insert(sessions)
    .values({
      tokenHash: hashToken(cookie),
      userId: owner.id,
      expiresAt: new Date(Date.now() + 600_000),
    });
  const accepted = await repository.reserve({
    ownerId: owner.id,
    route: 'file',
    idempotencyKey: `fixture-${stamp}`,
    inputDigest: 'a'.repeat(64),
  });
  const id = accepted.session.sessionId;
  const fileRef = `torrent_file_${randomBytes(16).toString('base64url')}`;
  const pending = await repository.transition(id, 1, 'fetching_metadata');
  const probing = await repository.replaceFiles(id, pending.version, [
    {
      fileRef,
      displayName: 'fixture.mkv',
      engineFileIndex: source.file as number,
      sizeBytes: source.size,
    },
  ]);
  await repository.bindEngine(id, source.key);
  await repository.saveProbe(id, probing.version, { ...raw, fileRef });
  const input = new TorrentInputService(config, repository, engine, {} as MediaRegistryService);
  const playback = new TorrentPlaybackService(repository, input, gateway);
  const hls = new TorrentHlsService(repository, gateway, metrics);
  const stop = async (ownerId: string, sessionId: string) => {
    if (await repository.requestStop(ownerId, sessionId)) await gateway.stop(sessionId);
  };
  const module = await Test.createTestingModule({
    controllers: [TorrentInputController, TorrentHlsController],
    providers: [
      { provide: ConfigService, useValue: config },
      TorrentBudgets,
      { provide: AuthRepository, useValue: new AuthRepository(database) },
      { provide: TorrentInputService, useValue: input },
      { provide: TorrentPlaybackService, useValue: playback },
      { provide: TorrentHlsService, useValue: hls },
      { provide: TorrentSessionReconciler, useValue: { stop } },
    ],
  }).compile();
  const app = module.createNestApplication();
  app.use(cookieParser());
  app.setGlobalPrefix('api/v1');
  app.useGlobalInterceptors(new ApiResponseInterceptor());
  app.useGlobalFilters(
    new ApiExceptionFilter({ logUnexpectedError: () => {} } as unknown as AppLogger),
  );
  await app.listen(49080, '0.0.0.0');
  try {
    await copyFile(join(root, 'fixture.mkv'), join(directory, 'input.mkv'));
    await writeFile(join(directory, 'stand.json'), JSON.stringify({ sessionId: id, cookie }));
    for (const deadline = Date.now() + 300_000; Date.now() < deadline;) {
      try {
        await readFile(join(directory, 'stop'));
        return;
      } catch {
        /* wait for browser */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error('Browser stand deadline');
  } finally {
    await gateway.stop(id);
    await app.close();
    await database.db.delete(users).where(eq(users.id, owner.id));
    await database.onApplicationShutdown();
  }
}
