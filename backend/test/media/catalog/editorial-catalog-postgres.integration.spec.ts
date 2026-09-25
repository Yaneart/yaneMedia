import { createHash, randomUUID } from 'node:crypto';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Client } from 'pg';
import type { DatabaseService } from '../../../src/database/database.service';
import { EditorialCatalogRepository } from '../../../src/media/catalog/editorial-catalog.repository';
import {
  catalogRevisions,
  mediaAssets,
  mediaCatalogItems,
} from '../../../src/media/catalog/editorial-catalog.schema';

const describePostgres =
  process.env.EDITORIAL_CATALOG_POSTGRES_TEST === '1' ? describe : describe.skip;

describePostgres('editorial catalog with PostgreSQL', () => {
  let client: Client;
  let repository: EditorialCatalogRepository;
  let previousPublished: { id: string; updatedAt: Date } | undefined;
  const revisionIds: string[] = [];
  const assetIds: string[] = [];

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    [previousPublished] = await drizzle(client)
      .select({ id: catalogRevisions.id, updatedAt: catalogRevisions.updatedAt })
      .from(catalogRevisions)
      .where(eq(catalogRevisions.status, 'published'));
    repository = new EditorialCatalogRepository({
      db: drizzle(client),
    } as unknown as DatabaseService);
  });

  afterAll(async () => {
    try {
      if (revisionIds.length > 0) {
        await drizzle(client)
          .delete(catalogRevisions)
          .where(inArray(catalogRevisions.id, revisionIds));
      }
      if (assetIds.length > 0) {
        await drizzle(client).delete(mediaAssets).where(inArray(mediaAssets.id, assetIds));
      }
      if (previousPublished) {
        await drizzle(client)
          .update(catalogRevisions)
          .set({ status: 'published', updatedAt: previousPublished.updatedAt })
          .where(eq(catalogRevisions.id, previousPublished.id));
      }
    } finally {
      await client?.end();
    }
  });

  it('switches revisions atomically while preserving order and inactive rows', async () => {
    const database = drizzle(client);
    const source = `integration-${randomUUID()}`;
    const checksum = (value: string) => createHash('sha256').update(value).digest('hex');
    const [protectedAsset, unusedAsset] = await database
      .insert(mediaAssets)
      .values([
        {
          kind: 'poster',
          objectKey: `${checksum(`${source}-protected`)}.jpg`,
          mimeType: 'image/jpeg',
          width: 600,
          height: 900,
          byteSize: 100,
          checksum: checksum(`${source}-protected`),
          sourceUrl: `https://images.example/${source}/protected.jpg`,
          createdAt: new Date('2020-01-01T00:00:00.000Z'),
        },
        {
          kind: 'poster',
          objectKey: `${checksum(`${source}-unused`)}.jpg`,
          mimeType: 'image/jpeg',
          width: 600,
          height: 900,
          byteSize: 100,
          checksum: checksum(`${source}-unused`),
          sourceUrl: `https://images.example/${source}/unused.jpg`,
          createdAt: new Date('2020-01-01T00:00:00.000Z'),
        },
      ])
      .returning({ id: mediaAssets.id, objectKey: mediaAssets.objectKey });
    assetIds.push(protectedAsset.id, unusedAsset.id);
    const beforeUserRows = await client.query<{ count: string }>('select count(*) from users');
    const firstRevision = await repository.createStagingRevision(`${source}-first`);
    revisionIds.push(firstRevision);
    await repository.upsertStagingItems(firstRevision, [
      {
        mediaRef: 'imdb:tt0000002',
        type: 'movie',
        title: 'Second',
        genres: ['Drama'],
        status: 'ready',
        active: true,
      },
      {
        mediaRef: 'imdb:tt0000001',
        type: 'movie',
        title: 'First',
        genres: ['Drama'],
        posterAssetId: protectedAsset.id,
        status: 'ready',
        active: true,
      },
    ]);
    await repository.replaceStagingIdentities(firstRevision, [
      {
        mediaRef: 'imdb:tt0000002',
        externalMediaRefs: ['imdb:tt0000002', 'kinopoisk:2000002'],
        provenance: 'integration-test',
      },
      {
        mediaRef: 'imdb:tt0000001',
        externalMediaRefs: ['imdb:tt0000001'],
        provenance: 'integration-test',
      },
    ]);
    await repository.upsertStagingCollection(
      firstRevision,
      {
        stableId: 'movie-editorial-picks',
        scope: 'catalog',
        type: 'movie',
        title: 'Editorial picks',
        position: 1,
        active: true,
      },
      [
        { mediaRef: 'imdb:tt0000002', position: 2 },
        { mediaRef: 'imdb:tt0000001', position: 1 },
      ],
    );
    await repository.publishRevision(firstRevision);

    await expect(
      repository.findPublishedItems(['kinopoisk:2000002', 'imdb:tt9999999', 'imdb:tt0000001']),
    ).resolves.toEqual([
      expect.objectContaining({ mediaRef: 'imdb:tt0000002', title: 'Second' }),
      expect.objectContaining({ mediaRef: 'imdb:tt0000001', title: 'First' }),
    ]);
    await expect(repository.findPublishedIdentity('kinopoisk:2000002')).resolves.toEqual({
      mediaRef: 'imdb:tt0000002',
      externalIds: { imdb: 'tt0000002', kinopoisk: '2000002' },
      provenance: ['integration-test'],
    });
    await expect(
      repository.findPublishedCollectionItems({ scope: 'catalog', type: 'movie' }),
    ).resolves.toEqual([
      expect.objectContaining({ mediaRef: 'imdb:tt0000001', mediaPosition: 1 }),
      expect.objectContaining({ mediaRef: 'imdb:tt0000002', mediaPosition: 2 }),
    ]);

    const secondRevision = await repository.createStagingRevision(`${source}-second`);
    revisionIds.push(secondRevision);
    await repository.upsertStagingItems(secondRevision, [
      {
        mediaRef: 'imdb:tt0000003',
        type: 'movie',
        title: 'Third',
        genres: ['Comedy'],
        status: 'ready',
        active: true,
      },
    ]);
    await repository.replaceStagingIdentities(secondRevision, [
      {
        mediaRef: 'imdb:tt0000003',
        externalMediaRefs: ['imdb:tt0000003'],
        provenance: 'integration-test',
      },
    ]);
    await repository.carryPublishedItemsAsInactive(secondRevision, ['imdb:tt0000003']);
    await repository.upsertStagingCollection(
      secondRevision,
      {
        stableId: 'movie-editorial-picks',
        scope: 'catalog',
        type: 'movie',
        title: 'Editorial picks',
        position: 1,
        active: true,
      },
      [{ mediaRef: 'imdb:tt0000003', position: 1 }],
    );

    await expect(repository.findPublishedItems(['imdb:tt0000001'])).resolves.toHaveLength(1);
    await repository.publishRevision(secondRevision);
    await expect(
      repository.findPublishedItems(['imdb:tt0000001', 'imdb:tt0000003']),
    ).resolves.toEqual([
      expect.objectContaining({ mediaRef: 'imdb:tt0000001' }),
      expect.objectContaining({ mediaRef: 'imdb:tt0000003' }),
    ]);

    const revisions = await database
      .select({ id: catalogRevisions.id, status: catalogRevisions.status })
      .from(catalogRevisions)
      .where(inArray(catalogRevisions.id, revisionIds));
    expect(revisions).toEqual(
      expect.arrayContaining([
        { id: firstRevision, status: 'retired' },
        { id: secondRevision, status: 'published' },
      ]),
    );
    await expect(
      database
        .select({ count: sql<number>`count(*)::int` })
        .from(mediaCatalogItems)
        .where(
          and(
            eq(mediaCatalogItems.revisionId, secondRevision),
            eq(mediaCatalogItems.mediaRef, 'imdb:tt0000001'),
            eq(mediaCatalogItems.active, false),
          ),
        ),
    ).resolves.toEqual([{ count: 1 }]);

    await expect(
      repository.findUnreferencedAssets(new Date('2021-01-01T00:00:00.000Z')),
    ).resolves.toEqual([
      expect.objectContaining({ id: unusedAsset.id, objectKey: unusedAsset.objectKey }),
    ]);
    await expect(repository.deleteAssetIfUnreferenced(protectedAsset.id)).resolves.toBe(false);
    await expect(repository.deleteAssetIfUnreferenced(unusedAsset.id)).resolves.toBe(true);

    await expect(repository.publishRevision(firstRevision)).rejects.toThrow(
      'Catalog revision is not staging',
    );
    await expect(
      database
        .select({ id: catalogRevisions.id })
        .from(catalogRevisions)
        .where(eq(catalogRevisions.status, 'published')),
    ).resolves.toEqual([{ id: secondRevision }]);

    const afterUserRows = await client.query<{ count: string }>('select count(*) from users');
    expect(afterUserRows.rows).toEqual(beforeUserRows.rows);
  });
});
