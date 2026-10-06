import { ConflictException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import type { DatabaseService } from '../../../src/database/database.service';
import { MediaRegistryService } from '../../../src/media/registry/media-registry.service';
import { mediaWorks } from '../../../src/media/registry/media-registry.schema';
import { users } from '../../../src/users/entities/user.entity';

const describePostgres =
  process.env.MEDIA_REGISTRY_POSTGRES_TEST === '1' ? describe : describe.skip;
const fixtureId = BigInt(Date.now().toString().slice(-10)).toString();
const secondFixtureId = (BigInt(fixtureId) + 1n).toString();
const animeBridgeId = (BigInt(fixtureId) + 2n).toString();
const cinemaBridgeId = (BigInt(fixtureId) + 3n).toString();
const splitAnimeId = (BigInt(fixtureId) + 4n).toString();
const splitMalId = (BigInt(fixtureId) + 5n).toString();
const fixtureTitle = `Registry Fixture ${fixtureId}`;

describePostgres('media registry with PostgreSQL', () => {
  let client: Client;
  let registry: MediaRegistryService;
  const createdRefs: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    registry = new MediaRegistryService({ db: drizzle(client) } as unknown as DatabaseService);
  });

  afterAll(async () => {
    try {
      if (createdUserIds.length > 0) {
        await drizzle(client).delete(users).where(inArray(users.id, createdUserIds));
      }
      if (createdRefs.length > 0) {
        await drizzle(client).delete(mediaWorks).where(inArray(mediaWorks.mediaRef, createdRefs));
      }
    } finally {
      await client?.end();
    }
  });

  it('keeps one opaque work and route while verified aliases are added', async () => {
    const created = await registry.resolveOrCreate({
      type: 'anime',
      ids: { aniList: fixtureId, shikimori: fixtureId, imdb: `tt${fixtureId}` },
      title: fixtureTitle,
      year: 2006,
    });
    createdRefs.push(created.mediaRef);

    const enriched = await registry.resolveOrCreate({
      type: 'anime',
      ids: { shikimori: fixtureId, kinopoisk: fixtureId },
      title: fixtureTitle,
      year: 2006,
    });

    expect(created.mediaRef).toMatch(/^work_[0-9a-f-]{36}$/);
    expect(enriched).toMatchObject({
      mediaRef: created.mediaRef,
      slug: `registry-fixture-${fixtureId}`,
    });
    const resolvedAlias = await registry.resolve(`kinopoisk:${fixtureId}`);
    expect(resolvedAlias).toMatchObject({
      mediaRef: created.mediaRef,
      slug: `registry-fixture-${fixtureId}`,
    });
    expect(resolvedAlias?.ids).toMatchObject({ aniList: fixtureId, imdb: `tt${fixtureId}` });
    await expect(registry.resolve(`registry-fixture-${fixtureId}`)).resolves.toMatchObject({
      mediaRef: created.mediaRef,
    });
    await expect(registry.resolve(`anilist:${fixtureId}`)).resolves.toMatchObject({
      mediaRef: created.mediaRef,
    });
  });

  it('allocates a collision-safe readable route and rejects identity conflicts', async () => {
    const second = await registry.resolveOrCreate({
      type: 'movie',
      ids: { imdb: `tt${secondFixtureId}` },
      title: fixtureTitle,
      year: 2006,
    });
    createdRefs.push(second.mediaRef);

    expect(second.slug).toBe(`registry-fixture-${fixtureId}-2006`);
    await expect(
      registry.resolveOrCreate({
        type: 'anime',
        ids: { shikimori: fixtureId, imdb: `tt${secondFixtureId}` },
        title: 'Conflicting fixture',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('merges a verified cross-type bridge and keeps old routes as redirects', async () => {
    const anime = await registry.resolveOrCreate({
      type: 'anime',
      ids: { aniList: animeBridgeId },
      title: `Anime Bridge ${animeBridgeId}`,
    });
    const series = await registry.resolveOrCreate({
      type: 'series',
      ids: { imdb: `tt${cinemaBridgeId}` },
      title: `Cinema Bridge ${cinemaBridgeId}`,
    });
    createdRefs.push(anime.mediaRef, series.mediaRef);

    const merged = await registry.resolveOrMergeVerified({
      type: 'anime',
      ids: { aniList: animeBridgeId, imdb: `tt${cinemaBridgeId}` },
      title: `Anime Bridge ${animeBridgeId}`,
    });

    expect(merged).toMatchObject({ mediaRef: anime.mediaRef, type: 'anime' });
    expect(merged.ids).toMatchObject({ aniList: animeBridgeId, imdb: `tt${cinemaBridgeId}` });
    await expect(registry.resolve(series.mediaRef)).resolves.toMatchObject({
      mediaRef: anime.mediaRef,
      slug: anime.slug,
    });
    await expect(registry.resolve(series.slug)).resolves.toMatchObject({
      mediaRef: anime.mediaRef,
      slug: anime.slug,
    });
  });

  it('repairs split same-type works when verified aliases connect them', async () => {
    const aniListWork = await registry.resolveOrCreate({
      type: 'anime',
      ids: { aniList: splitAnimeId },
      title: `Split Anime ${splitAnimeId}`,
    });
    const malWork = await registry.resolveOrCreate({
      type: 'anime',
      ids: { myAnimeList: splitMalId, shikimori: splitMalId },
      title: `Split Anime ${splitAnimeId} Season`,
    });
    createdRefs.push(aniListWork.mediaRef, malWork.mediaRef);
    const [user] = await drizzle(client)
      .insert(users)
      .values({
        displayName: 'Registry merge probe',
        email: `registry-merge-${randomUUID()}@example.com`,
        passwordHash: 'unused',
      })
      .returning({ id: users.id });
    if (!user) throw new Error('Expected a persisted user');
    createdUserIds.push(user.id);
    await client.query(
      `insert into favorites (user_id, media_ref, added_at) values
        ($1, $2, '2026-10-01T10:00:00.000Z'), ($1, $3, '2026-10-02T10:00:00.000Z')`,
      [user.id, aniListWork.mediaRef, malWork.mediaRef],
    );
    await client.query(
      `insert into history_items (user_id, media_ref, opened_at) values
        ($1, $2, '2026-10-01T10:00:00.000Z'), ($1, $3, '2026-10-02T10:00:00.000Z')`,
      [user.id, aniListWork.mediaRef, malWork.mediaRef],
    );
    await client.query(
      `insert into continue_watching_items
        (user_id, media_ref, source_ref, position_seconds, duration_seconds, updated_at) values
        ($1, $2, 'older-source', 120, 1000, '2026-10-01T10:00:00.000Z'),
        ($1, $3, 'newer-source', 240, 1000, '2026-10-02T10:00:00.000Z')`,
      [user.id, aniListWork.mediaRef, malWork.mediaRef],
    );

    const merged = await registry.resolveOrMergeVerified({
      type: 'anime',
      ids: {
        aniList: splitAnimeId,
        myAnimeList: splitMalId,
        shikimori: splitMalId,
      },
      title: `Split Anime ${splitAnimeId}`,
    });

    expect([aniListWork.mediaRef, malWork.mediaRef]).toContain(merged.mediaRef);
    expect(merged.ids).toEqual(
      expect.objectContaining({
        aniList: splitAnimeId,
        myAnimeList: splitMalId,
        shikimori: splitMalId,
      }),
    );
    const userMedia = await client.query<{
      kind: string;
      media_ref: string;
      timestamp: Date;
      source_ref: string | null;
      position_seconds: number | null;
    }>(
      `select 'favorite' as kind, media_ref, added_at as timestamp, null::varchar as source_ref,
          null::double precision as position_seconds from favorites where user_id = $1
       union all
       select 'history', media_ref, opened_at, null::varchar, null::double precision
          from history_items where user_id = $1
       union all
       select 'progress', media_ref, updated_at, source_ref, position_seconds
          from continue_watching_items where user_id = $1
       order by kind`,
      [user.id],
    );
    expect(userMedia.rows).toEqual([
      expect.objectContaining({ kind: 'favorite', media_ref: merged.mediaRef }),
      expect.objectContaining({ kind: 'history', media_ref: merged.mediaRef }),
      expect.objectContaining({
        kind: 'progress',
        media_ref: merged.mediaRef,
        source_ref: 'newer-source',
        position_seconds: 240,
      }),
    ]);
    expect(
      userMedia.rows.every(({ timestamp }) => timestamp.toISOString().startsWith('2026-10-02')),
    ).toBe(true);

    const redirected = merged.mediaRef === aniListWork.mediaRef ? malWork : aniListWork;
    await expect(registry.resolve(redirected.mediaRef)).resolves.toMatchObject({
      mediaRef: merged.mediaRef,
      slug: merged.slug,
    });
    await expect(registry.resolve(redirected.slug)).resolves.toMatchObject({
      mediaRef: merged.mediaRef,
      slug: merged.slug,
    });
  });
});
