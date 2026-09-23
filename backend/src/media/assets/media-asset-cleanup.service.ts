import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EditorialCatalogRepository } from '../catalog/editorial-catalog.repository';
import { MediaAssetStore, type MediaAssetKind } from './media-asset-store';

const DAY_MS = 24 * 60 * 60 * 1_000;

export interface MediaAssetCleanupOptions {
  apply?: boolean;
  now?: Date;
  gracePeriodDays?: number;
}

export interface MediaAssetCleanupCandidate {
  kind: MediaAssetKind;
  objectKey: string;
  origin: 'database' | 'filesystem';
  createdAt: string;
}

export interface MediaAssetCleanupReport {
  dryRun: boolean;
  gracePeriodDays: number;
  candidates: MediaAssetCleanupCandidate[];
  deleted: number;
  skipped: number;
}

@Injectable()
export class MediaAssetCleanupService {
  private readonly defaultGracePeriodDays: number;

  constructor(
    config: ConfigService,
    private readonly repository: EditorialCatalogRepository,
    private readonly assetStore: MediaAssetStore,
  ) {
    this.defaultGracePeriodDays = config.get<number>('MEDIA_ASSET_CLEANUP_GRACE_DAYS', 30);
  }

  async cleanup(options: MediaAssetCleanupOptions = {}): Promise<MediaAssetCleanupReport> {
    const now = options.now ?? new Date();
    const gracePeriodDays = options.gracePeriodDays ?? this.defaultGracePeriodDays;
    if (!Number.isInteger(gracePeriodDays) || gracePeriodDays < 1) {
      throw new Error('Asset cleanup grace period must be a positive whole number of days');
    }

    const cutoff = new Date(now.getTime() - gracePeriodDays * DAY_MS);
    const [databaseCandidates, databaseObjectKeys, storedFiles] = await Promise.all([
      this.repository.findUnreferencedAssets(cutoff),
      this.repository.findAssetObjectKeys(),
      this.assetStore.listStoredAssets(),
    ]);
    const knownObjectKeys = new Set(databaseObjectKeys);
    const filesystemCandidates = storedFiles.filter(
      ({ objectKey, modifiedAt }) => !knownObjectKeys.has(objectKey) && modifiedAt <= cutoff,
    );
    const candidates: MediaAssetCleanupCandidate[] = [
      ...databaseCandidates.map((asset) => ({
        kind: asset.kind,
        objectKey: asset.objectKey,
        origin: 'database' as const,
        createdAt: asset.createdAt.toISOString(),
      })),
      ...filesystemCandidates.map((asset) => ({
        kind: asset.kind,
        objectKey: asset.objectKey,
        origin: 'filesystem' as const,
        createdAt: asset.modifiedAt.toISOString(),
      })),
    ].sort((left, right) =>
      `${left.kind}:${left.objectKey}`.localeCompare(`${right.kind}:${right.objectKey}`),
    );

    if (!options.apply) {
      return { dryRun: true, gracePeriodDays, candidates, deleted: 0, skipped: 0 };
    }

    let deleted = 0;
    let skipped = 0;
    for (const asset of databaseCandidates) {
      if (!(await this.repository.deleteAssetIfUnreferenced(asset.id))) {
        skipped += 1;
        continue;
      }
      await this.assetStore.delete(asset.kind, asset.objectKey);
      deleted += 1;
    }
    for (const asset of filesystemCandidates) {
      if (await this.assetStore.delete(asset.kind, asset.objectKey)) deleted += 1;
    }

    return { dryRun: false, gracePeriodDays, candidates, deleted, skipped };
  }
}
