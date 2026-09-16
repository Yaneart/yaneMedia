import { Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import type { MediaRefType } from '../media-ref';
import {
  catalogRevisions,
  mediaAssets,
  mediaCatalogItems,
  mediaCollectionItems,
  mediaCollections,
  type NewMediaAsset,
  type NewMediaCatalogItem,
  type NewMediaCollection,
} from './editorial-catalog.schema';

export type StagingCatalogItem = Omit<
  NewMediaCatalogItem,
  'revisionId' | 'createdAt' | 'updatedAt'
>;

export type StagingCollection = Omit<
  NewMediaCollection,
  'id' | 'revisionId' | 'createdAt' | 'updatedAt'
>;

export interface StagingCollectionItem {
  mediaRef: string;
  position: number;
}

@Injectable()
export class EditorialCatalogRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async createStagingRevision(source: string): Promise<string> {
    const [revision] = await this.databaseService.db
      .insert(catalogRevisions)
      .values({ source })
      .returning({ id: catalogRevisions.id });

    if (!revision) throw new Error('Failed to create a catalog revision');
    return revision.id;
  }

  upsertAssets(assets: readonly NewMediaAsset[]) {
    if (assets.length === 0) return Promise.resolve([]);

    return this.databaseService.db
      .insert(mediaAssets)
      .values([...assets])
      .onConflictDoUpdate({
        target: mediaAssets.checksum,
        set: {
          kind: sql`excluded.kind`,
          objectKey: sql`excluded.object_key`,
          mimeType: sql`excluded.mime_type`,
          width: sql`excluded.width`,
          height: sql`excluded.height`,
          byteSize: sql`excluded.byte_size`,
          sourceUrl: sql`excluded.source_url`,
          updatedAt: sql`clock_timestamp()`,
        },
      })
      .returning({ id: mediaAssets.id, checksum: mediaAssets.checksum });
  }

  async upsertStagingItems(
    revisionId: string,
    items: readonly StagingCatalogItem[],
  ): Promise<void> {
    if (items.length === 0) return;

    await this.databaseService.db.transaction(async (transaction) => {
      const [revision] = await transaction
        .select({ status: catalogRevisions.status })
        .from(catalogRevisions)
        .where(eq(catalogRevisions.id, revisionId))
        .for('update');

      if (revision?.status !== 'staging') {
        throw new Error('Catalog revision is not staging');
      }

      await transaction
        .insert(mediaCatalogItems)
        .values(items.map((item) => ({ ...item, revisionId })))
        .onConflictDoUpdate({
          target: [mediaCatalogItems.revisionId, mediaCatalogItems.mediaRef],
          set: {
            type: sql`excluded.type`,
            title: sql`excluded.title`,
            originalTitle: sql`excluded.original_title`,
            year: sql`excluded.year`,
            shortDescription: sql`excluded.short_description`,
            genres: sql`excluded.genres`,
            rating: sql`excluded.rating`,
            posterAssetId: sql`excluded.poster_asset_id`,
            backdropAssetId: sql`excluded.backdrop_asset_id`,
            status: sql`excluded.status`,
            active: sql`excluded.active`,
            updatedAt: sql`clock_timestamp()`,
          },
        });
    });
  }

  async upsertStagingCollection(
    revisionId: string,
    collection: StagingCollection,
    items: readonly StagingCollectionItem[],
  ): Promise<void> {
    await this.databaseService.db.transaction(async (transaction) => {
      const [revision] = await transaction
        .select({ status: catalogRevisions.status })
        .from(catalogRevisions)
        .where(eq(catalogRevisions.id, revisionId))
        .for('update');

      if (revision?.status !== 'staging') {
        throw new Error('Catalog revision is not staging');
      }

      const [storedCollection] = await transaction
        .insert(mediaCollections)
        .values({ ...collection, revisionId })
        .onConflictDoUpdate({
          target: [mediaCollections.revisionId, mediaCollections.stableId],
          set: {
            scope: collection.scope,
            type: collection.type ?? null,
            title: collection.title,
            position: collection.position,
            active: collection.active ?? true,
            updatedAt: sql`clock_timestamp()`,
          },
        })
        .returning({ id: mediaCollections.id });

      if (!storedCollection) throw new Error('Failed to store a catalog collection');

      await transaction
        .delete(mediaCollectionItems)
        .where(eq(mediaCollectionItems.collectionId, storedCollection.id));

      if (items.length > 0) {
        await transaction.insert(mediaCollectionItems).values(
          items.map((item) => ({
            revisionId,
            collectionId: storedCollection.id,
            mediaRef: item.mediaRef,
            position: item.position,
          })),
        );
      }
    });
  }

  async publishRevision(revisionId: string): Promise<void> {
    await this.databaseService.db.transaction(async (transaction) => {
      await transaction.execute(sql`lock table ${catalogRevisions} in share row exclusive mode`);
      await transaction
        .update(catalogRevisions)
        .set({ status: 'retired', updatedAt: sql`clock_timestamp()` })
        .where(eq(catalogRevisions.status, 'published'));

      const [published] = await transaction
        .update(catalogRevisions)
        .set({
          status: 'published',
          publishedAt: sql`clock_timestamp()`,
          updatedAt: sql`clock_timestamp()`,
        })
        .where(and(eq(catalogRevisions.id, revisionId), eq(catalogRevisions.status, 'staging')))
        .returning({ id: catalogRevisions.id });

      if (!published) throw new Error('Catalog revision is not staging');
    });
  }

  async findPublishedItems(mediaRefs: readonly string[]) {
    if (mediaRefs.length === 0) return [];

    const rows = await this.databaseService.db
      .select({
        mediaRef: mediaCatalogItems.mediaRef,
        type: mediaCatalogItems.type,
        title: mediaCatalogItems.title,
        originalTitle: mediaCatalogItems.originalTitle,
        year: mediaCatalogItems.year,
        shortDescription: mediaCatalogItems.shortDescription,
        genres: mediaCatalogItems.genres,
        rating: mediaCatalogItems.rating,
        posterAssetId: mediaCatalogItems.posterAssetId,
        backdropAssetId: mediaCatalogItems.backdropAssetId,
      })
      .from(mediaCatalogItems)
      .innerJoin(catalogRevisions, eq(catalogRevisions.id, mediaCatalogItems.revisionId))
      .where(
        and(
          eq(catalogRevisions.status, 'published'),
          eq(mediaCatalogItems.status, 'ready'),
          eq(mediaCatalogItems.active, true),
          inArray(mediaCatalogItems.mediaRef, [...new Set(mediaRefs)]),
        ),
      );
    const rowsByMediaRef = new Map(rows.map((row) => [row.mediaRef, row]));

    return mediaRefs.flatMap((mediaRef) => {
      const row = rowsByMediaRef.get(mediaRef);
      return row ? [row] : [];
    });
  }

  findPublishedCollectionItems(options: { scope: 'home' | 'catalog'; type?: MediaRefType | null }) {
    const typeCondition =
      options.type === null
        ? isNull(mediaCollections.type)
        : options.type
          ? eq(mediaCollections.type, options.type)
          : undefined;

    return this.databaseService.db
      .select({
        collectionId: mediaCollections.stableId,
        collectionTitle: mediaCollections.title,
        collectionPosition: mediaCollections.position,
        mediaRef: mediaCatalogItems.mediaRef,
        mediaPosition: mediaCollectionItems.position,
        type: mediaCatalogItems.type,
        title: mediaCatalogItems.title,
      })
      .from(mediaCollections)
      .innerJoin(catalogRevisions, eq(catalogRevisions.id, mediaCollections.revisionId))
      .innerJoin(
        mediaCollectionItems,
        and(
          eq(mediaCollectionItems.collectionId, mediaCollections.id),
          eq(mediaCollectionItems.revisionId, mediaCollections.revisionId),
        ),
      )
      .innerJoin(
        mediaCatalogItems,
        and(
          eq(mediaCatalogItems.revisionId, mediaCollectionItems.revisionId),
          eq(mediaCatalogItems.mediaRef, mediaCollectionItems.mediaRef),
        ),
      )
      .where(
        and(
          eq(catalogRevisions.status, 'published'),
          eq(mediaCollections.scope, options.scope),
          eq(mediaCollections.active, true),
          eq(mediaCatalogItems.active, true),
          eq(mediaCatalogItems.status, 'ready'),
          typeCondition,
        ),
      )
      .orderBy(
        asc(mediaCollections.position),
        asc(mediaCollections.stableId),
        asc(mediaCollectionItems.position),
        asc(mediaCatalogItems.mediaRef),
      );
  }
}
