import { Injectable } from '@nestjs/common';
import type { MediaSummaryDto } from '../dto/media-summary.dto';
import type { MediaRefType } from '../media-ref';
import { MediaService } from '../media.service';
import {
  MediaAssetStore,
  type MediaAssetKind,
  type StoredMediaAsset,
} from '../assets/media-asset-store';
import {
  editorialManifest,
  parseEditorialCatalogManifest,
  type EditorialCatalogManifest,
} from './editorial-catalog';
import {
  EditorialCatalogRepository,
  type StagingCatalogItem,
} from './editorial-catalog.repository';

const DEFAULT_CONCURRENCY = 3;
const DEFAULT_RETRY_DELAYS_MS = [250, 1_000] as const;
const MIN_BACKDROP_WIDTH = 1_280;
const MIN_BACKDROP_ASPECT_RATIO = 4 / 3;

export interface EditorialCatalogSyncOptions {
  concurrency?: number;
  retryDelaysMs?: readonly number[];
}

export interface EditorialCatalogSyncReport {
  source: string;
  skipped: boolean;
  items: number;
  collections: number;
  downloadedAssets: number;
  reusedAssets: number;
}

interface ManifestItem {
  mediaRef: string;
  type: MediaRefType;
  artworkOverride?: { posterUrl?: string; backdropUrl?: string };
}

interface ResolvedItem extends ManifestItem {
  summary: MediaSummaryDto;
}

@Injectable()
export class EditorialCatalogSyncService {
  private readonly pendingMetadata = new Map<string, Promise<ResolvedItem>>();

  constructor(
    private readonly mediaService: MediaService,
    private readonly assetStore: MediaAssetStore,
    private readonly repository: EditorialCatalogRepository,
  ) {}

  async sync(
    input: unknown = editorialManifest,
    options: EditorialCatalogSyncOptions = {},
  ): Promise<EditorialCatalogSyncReport> {
    const manifest = parseEditorialCatalogManifest(input);
    const source = `${manifest.source}@${manifest.version}`;
    const items = this.toManifestItems(manifest);
    const collections = this.collectionCount(manifest);
    const existingRevision = await this.repository.findReusableRevision(source);

    if (existingRevision?.status === 'published') {
      return {
        source,
        skipped: true,
        items: items.length,
        collections,
        downloadedAssets: 0,
        reusedAssets: 0,
      };
    }

    const revisionId =
      existingRevision?.id ?? (await this.repository.createStagingRevision(source));
    const concurrency = Math.max(1, Math.floor(options.concurrency ?? DEFAULT_CONCURRENCY));
    const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
    const resolvedItems = await this.runBounded(items, concurrency, (item, queuedAt) =>
      this.resolveMetadata(item, queuedAt, retryDelaysMs),
    );
    const assetRequests = this.toAssetRequests(resolvedItems);
    const existingAssets = await this.findUsableAssets(assetRequests);
    const resolvedAssets = await this.runBounded(assetRequests, concurrency, ({ kind, url }) => {
      const existing = existingAssets.get(`${kind}:${url}`);
      return existing
        ? Promise.resolve({ asset: existing, reused: true })
        : this.retry(() => this.assetStore.import(kind, url), retryDelaysMs).then((asset) => ({
            asset,
            reused: false,
          }));
    });
    for (const { asset } of resolvedAssets) this.assertAssetQuality(asset);
    const assetsByRequest = new Map(
      assetRequests.map((request, index) => [
        `${request.kind}:${request.url}`,
        resolvedAssets[index].asset,
      ]),
    );
    const uniqueAssets = [
      ...new Map(resolvedAssets.map(({ asset }) => [asset.checksum, asset])).values(),
    ];
    const storedAssets = await this.repository.upsertAssets(uniqueAssets);
    const assetIdByChecksum = new Map(
      storedAssets.map(({ checksum, id }) => [checksum, id] as const),
    );

    await this.repository.upsertStagingItems(
      revisionId,
      resolvedItems.map((item) => this.toStagingItem(item, assetsByRequest, assetIdByChecksum)),
    );
    await this.storeCollections(revisionId, manifest);
    await this.repository.publishRevision(revisionId);

    return {
      source,
      skipped: false,
      items: items.length,
      collections,
      downloadedAssets: resolvedAssets.filter(({ reused }) => !reused).length,
      reusedAssets: resolvedAssets.filter(({ reused }) => reused).length,
    };
  }

  private toManifestItems(manifest: EditorialCatalogManifest): ManifestItem[] {
    return (['movie', 'series', 'anime'] as const).flatMap((type) =>
      manifest.catalogs[type].flatMap((collection) =>
        collection.mediaRefs.map((mediaRef) => ({
          mediaRef,
          type,
          artworkOverride: manifest.artworkOverrides[mediaRef],
        })),
      ),
    );
  }

  private resolveMetadata(
    item: ManifestItem,
    queuedAt: number,
    retryDelaysMs: readonly number[],
  ): Promise<ResolvedItem> {
    const pending = this.pendingMetadata.get(item.mediaRef);
    if (pending) return pending;

    const resolution = this.retry(async () => {
      const { summary } = await this.mediaService.getSummaryByRef(
        item.mediaRef,
        performance.now() - queuedAt,
      );
      if (!summary) throw new Error(`No metadata found for ${item.mediaRef}`);
      if (summary.mediaRef !== item.mediaRef || summary.type !== item.type) {
        throw new Error(`Metadata identity mismatch for ${item.mediaRef}`);
      }
      const resolvedSummary: MediaSummaryDto = {
        ...summary,
        ...(item.artworkOverride?.posterUrl
          ? { poster: { url: item.artworkOverride.posterUrl } }
          : {}),
        ...(item.artworkOverride?.backdropUrl
          ? { backdrop: { url: item.artworkOverride.backdropUrl } }
          : {}),
      };
      if (!resolvedSummary.title.trim() || resolvedSummary.title.length > 300) {
        throw new Error(`Invalid title for ${item.mediaRef}`);
      }
      if (!resolvedSummary.poster) throw new Error(`Poster is required for ${item.mediaRef}`);
      if (!resolvedSummary.backdrop) throw new Error(`Backdrop is required for ${item.mediaRef}`);
      return { ...item, summary: resolvedSummary };
    }, retryDelaysMs).finally(() => {
      if (this.pendingMetadata.get(item.mediaRef) === resolution) {
        this.pendingMetadata.delete(item.mediaRef);
      }
    });

    this.pendingMetadata.set(item.mediaRef, resolution);
    return resolution;
  }

  private toAssetRequests(items: readonly ResolvedItem[]) {
    const requests = items.flatMap(({ summary }) => [
      { kind: 'poster' as const, url: summary.poster!.url },
      ...(summary.backdrop ? [{ kind: 'backdrop' as const, url: summary.backdrop.url }] : []),
    ]);

    return [
      ...new Map(requests.map((request) => [`${request.kind}:${request.url}`, request])).values(),
    ];
  }

  private assertAssetQuality(asset: StoredMediaAsset): void {
    if (
      asset.kind === 'backdrop' &&
      (asset.width < MIN_BACKDROP_WIDTH || asset.width / asset.height < MIN_BACKDROP_ASPECT_RATIO)
    ) {
      throw new Error(`Backdrop does not meet quality requirements: ${asset.sourceUrl}`);
    }
  }

  private async findUsableAssets(requests: readonly { kind: MediaAssetKind; url: string }[]) {
    const rows = await this.repository.findAssetsBySourceUrls(requests.map(({ url }) => url));
    const usable = new Map<string, StoredMediaAsset>();

    await Promise.all(
      rows.map(async (asset) => {
        if (await this.assetStore.getPublicAsset(asset.kind, asset.objectKey)) {
          usable.set(`${asset.kind}:${asset.sourceUrl}`, asset);
        }
      }),
    );
    return usable;
  }

  private toStagingItem(
    item: ResolvedItem,
    assetsByRequest: ReadonlyMap<string, StoredMediaAsset>,
    assetIdByChecksum: ReadonlyMap<string, string>,
  ): StagingCatalogItem {
    const poster = assetsByRequest.get(`poster:${item.summary.poster!.url}`);
    const backdrop = item.summary.backdrop
      ? assetsByRequest.get(`backdrop:${item.summary.backdrop.url}`)
      : undefined;
    const posterAssetId = poster && assetIdByChecksum.get(poster.checksum);
    const backdropAssetId = backdrop && assetIdByChecksum.get(backdrop.checksum);
    if (!posterAssetId || !backdropAssetId) {
      throw new Error(`Failed to persist required artwork for ${item.mediaRef}`);
    }

    return {
      mediaRef: item.mediaRef,
      type: item.type,
      title: item.summary.title,
      originalTitle: item.summary.originalTitle,
      year: item.summary.year,
      shortDescription: item.summary.shortDescription,
      genres: [...new Set(item.summary.genres.map((genre) => genre.trim()).filter(Boolean))],
      rating: item.summary.rating?.value,
      posterAssetId,
      backdropAssetId,
      status: 'ready',
      active: true,
    };
  }

  private async storeCollections(
    revisionId: string,
    manifest: EditorialCatalogManifest,
  ): Promise<void> {
    for (const type of ['movie', 'series', 'anime'] as const) {
      for (const [index, collection] of manifest.catalogs[type].entries()) {
        await this.repository.upsertStagingCollection(
          revisionId,
          {
            stableId: `${type}-${collection.id}`,
            scope: 'catalog',
            type,
            title: collection.title,
            position: index + 1,
            active: true,
          },
          collection.mediaRefs.map((mediaRef, itemIndex) => ({
            mediaRef,
            position: itemIndex + 1,
          })),
        );
      }
    }

    await this.repository.upsertStagingCollection(
      revisionId,
      {
        stableId: 'featured',
        scope: 'home',
        type: null,
        title: 'Главное',
        position: 1,
        active: true,
      },
      manifest.featuredMediaRefs.map((mediaRef, index) => ({ mediaRef, position: index + 1 })),
    );
    for (const [index, collection] of manifest.homeCollections.entries()) {
      await this.repository.upsertStagingCollection(
        revisionId,
        {
          stableId: collection.id,
          scope: 'home',
          type: null,
          title: collection.title,
          position: index + 2,
          active: true,
        },
        collection.mediaRefs.map((mediaRef, itemIndex) => ({
          mediaRef,
          position: itemIndex + 1,
        })),
      );
    }
  }

  private collectionCount(manifest: EditorialCatalogManifest): number {
    return (
      manifest.homeCollections.length +
      1 +
      (['movie', 'series', 'anime'] as const).reduce(
        (total, type) => total + manifest.catalogs[type].length,
        0,
      )
    );
  }

  private async runBounded<T, R>(
    values: readonly T[],
    concurrency: number,
    run: (value: T, queuedAt: number) => Promise<R>,
  ): Promise<R[]> {
    const results = new Array<R>(values.length);
    const queuedAt = performance.now();
    let nextIndex = 0;
    let failed = false;
    let failure: unknown;
    const worker = async () => {
      while (!failed && nextIndex < values.length) {
        const index = nextIndex++;
        try {
          results[index] = await run(values[index], queuedAt);
        } catch (error) {
          if (!failed) {
            failed = true;
            failure = error;
          }
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
    if (failed) throw failure;
    return results;
  }

  private async retry<T>(operation: () => Promise<T>, delays: readonly number[]): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        const delay = delays[attempt];
        if (delay === undefined) throw error;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
}
