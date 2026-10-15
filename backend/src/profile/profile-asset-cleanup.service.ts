import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../platform/logging/app-logger';
import { ProfileAssetStore } from './profile-asset.store';
import { ProfileRepository } from './profile.repository';

const HOUR_MS = 60 * 60 * 1_000;

export type ProfileAssetCleanupOptions = {
  apply?: boolean;
  now?: Date;
  gracePeriodHours?: number;
};

export type ProfileAssetCleanupReport = {
  dryRun: boolean;
  candidates: Array<{ objectKey: string; origin: 'database' | 'filesystem' }>;
  deleted: number;
  skipped: number;
};

@Injectable()
export class ProfileAssetCleanupService implements OnModuleInit {
  private readonly defaultGracePeriodHours: number;

  constructor(
    config: ConfigService,
    private readonly repository: ProfileRepository,
    private readonly store: ProfileAssetStore,
    private readonly logger: AppLogger,
  ) {
    this.defaultGracePeriodHours = config.get<number>('PROFILE_ASSET_CLEANUP_GRACE_HOURS', 24);
  }

  async onModuleInit(): Promise<void> {
    await this.cleanup({ apply: true }).catch(() => {
      this.logger.logUnexpectedError('ProfileAssetCleanupService.onModuleInit');
    });
  }

  async cleanup(options: ProfileAssetCleanupOptions = {}): Promise<ProfileAssetCleanupReport> {
    const gracePeriodHours = options.gracePeriodHours ?? this.defaultGracePeriodHours;
    if (!Number.isInteger(gracePeriodHours) || gracePeriodHours < 1) {
      throw new Error(
        'Profile asset cleanup grace period must be a positive whole number of hours',
      );
    }

    const cutoff = new Date((options.now ?? new Date()).getTime() - gracePeriodHours * HOUR_MS);
    const [databaseAssets, objectKeys, storedFiles] = await Promise.all([
      this.repository.findUnreferencedAssets(cutoff),
      this.repository.findAssetObjectKeys(),
      this.store.listStoredAssets(),
    ]);
    const knownObjectKeys = new Set(objectKeys);
    const filesystemAssets = storedFiles.filter(
      ({ objectKey, modifiedAt }) => !knownObjectKeys.has(objectKey) && modifiedAt <= cutoff,
    );
    const candidates = [
      ...databaseAssets.map(({ objectKey }) => ({
        objectKey,
        origin: 'database' as const,
      })),
      ...filesystemAssets.map(({ objectKey }) => ({
        objectKey,
        origin: 'filesystem' as const,
      })),
    ].sort((left, right) => left.objectKey.localeCompare(right.objectKey));

    if (!options.apply) return { dryRun: true, candidates, deleted: 0, skipped: 0 };

    let deleted = 0;
    let skipped = 0;
    for (const asset of databaseAssets) {
      if (!(await this.repository.deleteAssetIfUnreferenced(asset.id))) {
        skipped += 1;
        continue;
      }
      if (await this.store.delete(asset.objectKey)) deleted += 1;
    }
    for (const asset of filesystemAssets) {
      if (await this.store.delete(asset.objectKey)) deleted += 1;
    }

    return { dryRun: false, candidates, deleted, skipped };
  }
}
