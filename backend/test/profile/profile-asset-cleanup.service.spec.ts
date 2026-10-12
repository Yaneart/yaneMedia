import { ConfigService } from '@nestjs/config';
import type { AppLogger } from '../../src/platform/logging/app-logger';
import { ProfileAssetCleanupService } from '../../src/profile/profile-asset-cleanup.service';
import type { ProfileAssetStore } from '../../src/profile/profile-asset.store';
import type { ProfileRepository } from '../../src/profile/profile.repository';

describe('ProfileAssetCleanupService', () => {
  const old = new Date('2026-10-10T00:00:00.000Z');
  const databaseAsset = {
    id: '28b47aca-2c26-482e-bcb8-2f438bb53072',
    objectKey: 'avatar_28b47aca-2c26-482e-bcb8-2f438bb53072.webp',
    mimeType: 'image/webp',
    width: 512,
    height: 512,
    byteSize: 123,
    checksum: 'a'.repeat(64),
    createdAt: old,
  };
  const filesystemKey = 'avatar_0a3c4b69-5016-4cc4-be89-1a25530014cd.webp';
  const findUnreferencedAssets = jest.fn().mockResolvedValue([databaseAsset]);
  const findAssetObjectKeys = jest.fn().mockResolvedValue([databaseAsset.objectKey]);
  const deleteAssetIfUnreferenced = jest.fn().mockResolvedValue(true);
  const listStoredAssets = jest.fn().mockResolvedValue([
    { objectKey: databaseAsset.objectKey, modifiedAt: old },
    { objectKey: filesystemKey, modifiedAt: old },
  ]);
  const deleteFile = jest.fn().mockResolvedValue(true);
  const service = new ProfileAssetCleanupService(
    new ConfigService({ PROFILE_ASSET_CLEANUP_GRACE_HOURS: 24 }),
    {
      findUnreferencedAssets,
      findAssetObjectKeys,
      deleteAssetIfUnreferenced,
    } as unknown as ProfileRepository,
    { listStoredAssets, delete: deleteFile } as unknown as ProfileAssetStore,
    { logUnexpectedError: jest.fn() } as unknown as AppLogger,
  );

  beforeEach(() => {
    deleteAssetIfUnreferenced.mockClear();
    deleteFile.mockClear();
  });

  it('reports database and filesystem orphans without mutating in dry-run mode', async () => {
    await expect(
      service.cleanup({ now: new Date('2026-10-12T00:00:00.000Z') }),
    ).resolves.toMatchObject({
      dryRun: true,
      candidates: [
        { objectKey: filesystemKey, origin: 'filesystem' },
        { objectKey: databaseAsset.objectKey, origin: 'database' },
      ],
    });
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('deletes detached database rows before files and removes filesystem-only orphans', async () => {
    await expect(
      service.cleanup({
        apply: true,
        now: new Date('2026-10-12T00:00:00.000Z'),
      }),
    ).resolves.toMatchObject({ dryRun: false, deleted: 2, skipped: 0 });
    expect(deleteAssetIfUnreferenced).toHaveBeenCalledWith(databaseAsset.id);
    expect(deleteFile).toHaveBeenCalledWith(databaseAsset.objectKey);
    expect(deleteFile).toHaveBeenCalledWith(filesystemKey);
  });
});
