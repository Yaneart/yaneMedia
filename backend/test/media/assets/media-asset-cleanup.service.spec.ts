import { ConfigService } from '@nestjs/config';
import type { EditorialCatalogRepository } from '../../../src/media/catalog/editorial-catalog.repository';
import { MediaAssetCleanupService } from '../../../src/media/assets/media-asset-cleanup.service';
import type { MediaAssetStore } from '../../../src/media/assets/media-asset-store';

const NOW = new Date('2026-09-23T12:00:00.000Z');
const OLD = new Date('2026-08-01T12:00:00.000Z');
const RECENT = new Date('2026-09-20T12:00:00.000Z');

function setup() {
  const repository = {
    findUnreferencedAssets: jest
      .fn()
      .mockResolvedValue([
        { id: 'unused', kind: 'poster', objectKey: `${'a'.repeat(64)}.jpg`, createdAt: OLD },
      ]),
    findAssetObjectKeys: jest.fn().mockResolvedValue([`${'a'.repeat(64)}.jpg`]),
    deleteAssetIfUnreferenced: jest.fn().mockResolvedValue(true),
  };
  const assetStore = {
    listStoredAssets: jest.fn().mockResolvedValue([
      { kind: 'poster', objectKey: `${'a'.repeat(64)}.jpg`, modifiedAt: OLD },
      { kind: 'backdrop', objectKey: `${'b'.repeat(64)}.webp`, modifiedAt: OLD },
      { kind: 'poster', objectKey: `${'c'.repeat(64)}.png`, modifiedAt: RECENT },
    ]),
    delete: jest.fn().mockResolvedValue(true),
  };
  const service = new MediaAssetCleanupService(
    new ConfigService({ MEDIA_ASSET_CLEANUP_GRACE_DAYS: 30 }),
    repository as unknown as EditorialCatalogRepository,
    assetStore as unknown as MediaAssetStore,
  );
  return { service, repository, assetStore };
}

describe('MediaAssetCleanupService', () => {
  it('reports only unreferenced files older than the grace period during dry run', async () => {
    const { service, repository, assetStore } = setup();

    await expect(service.cleanup({ now: NOW })).resolves.toEqual({
      dryRun: true,
      gracePeriodDays: 30,
      candidates: [
        expect.objectContaining({ origin: 'filesystem', objectKey: `${'b'.repeat(64)}.webp` }),
        expect.objectContaining({ origin: 'database', objectKey: `${'a'.repeat(64)}.jpg` }),
      ],
      deleted: 0,
      skipped: 0,
    });
    expect(repository.findUnreferencedAssets).toHaveBeenCalledWith(
      new Date('2026-08-24T12:00:00.000Z'),
    );
    expect(repository.deleteAssetIfUnreferenced).not.toHaveBeenCalled();
    expect(assetStore.delete).not.toHaveBeenCalled();
  });

  it('rechecks database references before deleting and counts protected candidates as skipped', async () => {
    const { service, repository, assetStore } = setup();
    repository.deleteAssetIfUnreferenced.mockResolvedValue(false);

    await expect(service.cleanup({ now: NOW, apply: true })).resolves.toMatchObject({
      dryRun: false,
      deleted: 1,
      skipped: 1,
    });
    expect(assetStore.delete).toHaveBeenCalledTimes(1);
    expect(assetStore.delete).toHaveBeenCalledWith('backdrop', `${'b'.repeat(64)}.webp`);
  });
});
