import type {
  MediaAssetStore,
  StoredMediaAsset,
} from '../../../src/media/assets/media-asset-store';
import {
  EditorialCatalogSyncService,
  type EditorialCatalogSyncOptions,
} from '../../../src/media/catalog/editorial-catalog-sync.service';
import type { EditorialCatalogManifest } from '../../../src/media/catalog/editorial-catalog';
import type { EditorialCatalogRepository } from '../../../src/media/catalog/editorial-catalog.repository';
import type { MediaSummaryDto } from '../../../src/media/dto/media-summary.dto';
import type { MediaService } from '../../../src/media/media.service';

const manifest: EditorialCatalogManifest = {
  version: 7,
  source: 'sync-test',
  featuredMediaRefs: ['imdb:tt0000001'],
  artworkOverrides: {},
  catalogs: {
    movie: [
      {
        id: 'movies',
        title: 'Movies',
        mediaRefs: ['imdb:tt0000001'],
      },
    ],
    series: [
      {
        id: 'series',
        title: 'Series',
        mediaRefs: ['imdb:tt0000002'],
      },
    ],
    anime: [
      {
        id: 'anime',
        title: 'Anime',
        mediaRefs: ['anilist:1'],
      },
    ],
  },
  homeCollections: [
    {
      id: 'home-picks',
      title: 'Home picks',
      mediaRefs: ['imdb:tt0000001', 'imdb:tt0000002', 'anilist:1'],
    },
  ],
};

const typesByRef = new Map([
  ['imdb:tt0000001', 'movie'],
  ['imdb:tt0000002', 'series'],
  ['anilist:1', 'anime'],
] as const);

function summary(mediaRef: string): MediaSummaryDto {
  const type = typesByRef.get(mediaRef);
  if (!type) throw new Error('Unknown test media ref');

  return {
    mediaRef,
    type,
    title: mediaRef,
    genres: ['Drama'],
    poster: { url: `https://images.example/${mediaRef}/poster.jpg` },
    backdrop: { url: `https://images.example/${mediaRef}/backdrop.jpg` },
  };
}

function storedAsset(kind: 'poster' | 'backdrop', sourceUrl: string): StoredMediaAsset {
  const checksum = Buffer.from(`${kind}:${sourceUrl}`).toString('hex').padEnd(64, '0').slice(0, 64);
  return {
    kind,
    sourceUrl,
    checksum,
    objectKey: `${checksum}.jpg`,
    mimeType: 'image/jpeg',
    width: kind === 'backdrop' ? 1920 : 600,
    height: kind === 'backdrop' ? 1080 : 900,
    byteSize: 1000,
  };
}

function setup(options: {
  getSummaryByRef?: jest.Mock;
  findReusableRevision?: jest.Mock;
  findAssetsBySourceUrls?: jest.Mock;
}) {
  const getSummaryByRef =
    options.getSummaryByRef ??
    jest.fn((mediaRef: string) => Promise.resolve({ summary: summary(mediaRef), meta: {} }));
  const assetImport = jest.fn((kind: 'poster' | 'backdrop', url: string) =>
    Promise.resolve(storedAsset(kind, url)),
  );
  const getPublicAsset = jest.fn().mockResolvedValue(undefined);
  const upsertAssets = jest.fn((assets: readonly StoredMediaAsset[]) =>
    Promise.resolve(
      assets.map((asset, index) => ({ id: `asset-${index}`, checksum: asset.checksum })),
    ),
  );
  const repository = {
    findReusableRevision: options.findReusableRevision ?? jest.fn().mockResolvedValue(undefined),
    createStagingRevision: jest.fn().mockResolvedValue('revision-1'),
    findAssetsBySourceUrls: options.findAssetsBySourceUrls ?? jest.fn().mockResolvedValue([]),
    upsertAssets,
    upsertStagingItems: jest.fn().mockResolvedValue(undefined),
    upsertStagingCollection: jest.fn().mockResolvedValue(undefined),
    publishRevision: jest.fn().mockResolvedValue(undefined),
  };
  const service = new EditorialCatalogSyncService(
    { getSummaryByRef } as unknown as MediaService,
    { import: assetImport, getPublicAsset } as unknown as MediaAssetStore,
    repository as unknown as EditorialCatalogRepository,
  );

  return { service, getSummaryByRef, assetImport, getPublicAsset, repository };
}

const noRetry: EditorialCatalogSyncOptions = { concurrency: 2, retryDelaysMs: [] };

describe('EditorialCatalogSyncService', () => {
  it('resolves in a bounded queue and publishes one complete ordered revision', async () => {
    let active = 0;
    let maximumActive = 0;
    const getSummaryByRef = jest.fn(async (mediaRef: string) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      return { summary: summary(mediaRef), meta: {} };
    });
    const { service, repository, assetImport } = setup({ getSummaryByRef });

    await expect(service.sync(manifest, noRetry)).resolves.toEqual({
      source: 'sync-test@7',
      skipped: false,
      items: 3,
      collections: 5,
      downloadedAssets: 6,
      reusedAssets: 0,
    });

    expect(maximumActive).toBe(2);
    expect(assetImport).toHaveBeenCalledTimes(6);
    expect(repository.upsertStagingItems).toHaveBeenCalledWith(
      'revision-1',
      expect.arrayContaining([
        expect.objectContaining({ mediaRef: 'imdb:tt0000001', status: 'ready' }),
        expect.objectContaining({ mediaRef: 'imdb:tt0000002', status: 'ready' }),
        expect.objectContaining({ mediaRef: 'anilist:1', status: 'ready' }),
      ]),
    );
    expect(repository.upsertStagingCollection).toHaveBeenCalledTimes(5);
    expect(repository.publishRevision).toHaveBeenCalledWith('revision-1');
    expect(repository.publishRevision.mock.invocationCallOrder[0]).toBeGreaterThan(
      repository.upsertStagingCollection.mock.invocationCallOrder.at(-1)!,
    );
  });

  it('is idempotent for an already published manifest', async () => {
    const { service, getSummaryByRef, repository } = setup({
      findReusableRevision: jest
        .fn()
        .mockResolvedValue({ id: 'published-revision', status: 'published' }),
    });

    await expect(service.sync(manifest, noRetry)).resolves.toMatchObject({
      skipped: true,
      items: 3,
    });
    expect(getSummaryByRef).not.toHaveBeenCalled();
    expect(repository.createStagingRevision).not.toHaveBeenCalled();
    expect(repository.publishRevision).not.toHaveBeenCalled();
  });

  it('retries a transient metadata failure with bounded backoff', async () => {
    const getSummaryByRef = jest
      .fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockImplementation((mediaRef: string) =>
        Promise.resolve({ summary: summary(mediaRef), meta: {} }),
      );
    const { service, repository } = setup({ getSummaryByRef });

    await expect(
      service.sync(manifest, { concurrency: 1, retryDelaysMs: [0] }),
    ).resolves.toMatchObject({ skipped: false });
    expect(getSummaryByRef).toHaveBeenCalledTimes(4);
    expect(repository.publishRevision).toHaveBeenCalledTimes(1);
  });

  it('reuses a matching persisted asset only when its local file still exists', async () => {
    const posterUrl = summary('imdb:tt0000001').poster!.url;
    const persisted = { id: 'existing-asset', ...storedAsset('poster', posterUrl) };
    const { service, assetImport, getPublicAsset } = setup({
      findAssetsBySourceUrls: jest.fn().mockResolvedValue([persisted]),
    });
    getPublicAsset.mockResolvedValueOnce({ path: 'poster', byteSize: 1000 });

    await expect(service.sync(manifest, noRetry)).resolves.toMatchObject({
      downloadedAssets: 5,
      reusedAssets: 1,
    });
    expect(assetImport).not.toHaveBeenCalledWith('poster', posterUrl);
  });

  it('uses a validated manifest artwork override when providers omit a required poster', async () => {
    const overrideManifest = structuredClone(manifest);
    overrideManifest.artworkOverrides['anilist:1'] = {
      posterUrl: 'https://images.example/anime/poster-override.jpg',
    };
    const getSummaryByRef = jest.fn((mediaRef: string) => {
      const resolved = summary(mediaRef);
      if (mediaRef === 'anilist:1') delete resolved.poster;
      return Promise.resolve({ summary: resolved, meta: {} });
    });
    const { service, assetImport } = setup({ getSummaryByRef });

    await expect(service.sync(overrideManifest, noRetry)).resolves.toMatchObject({
      skipped: false,
    });
    expect(assetImport).toHaveBeenCalledWith(
      'poster',
      'https://images.example/anime/poster-override.jpg',
    );
  });

  it('requires a backdrop for every catalog item and accepts an explicit override', async () => {
    const getSummaryByRef = jest.fn((mediaRef: string) => {
      const resolved = summary(mediaRef);
      if (mediaRef === 'imdb:tt0000002') delete resolved.backdrop;
      return Promise.resolve({ summary: resolved, meta: {} });
    });
    const failed = setup({ getSummaryByRef });

    await expect(failed.service.sync(manifest, noRetry)).rejects.toThrow(
      'Backdrop is required for imdb:tt0000002',
    );
    expect(failed.repository.publishRevision).not.toHaveBeenCalled();

    const overrideManifest = structuredClone(manifest);
    overrideManifest.artworkOverrides['imdb:tt0000002'] = {
      backdropUrl: 'https://images.example/series/backdrop-override.jpg',
    };
    const accepted = setup({ getSummaryByRef });

    await expect(accepted.service.sync(overrideManifest, noRetry)).resolves.toMatchObject({
      skipped: false,
    });
    expect(accepted.assetImport).toHaveBeenCalledWith(
      'backdrop',
      'https://images.example/series/backdrop-override.jpg',
    );
  });

  it('rejects a low-resolution backdrop before publishing the revision', async () => {
    const { service, assetImport, repository } = setup({});
    assetImport.mockImplementation((kind: 'poster' | 'backdrop', url: string) => {
      const asset = storedAsset(kind, url);
      return Promise.resolve(kind === 'backdrop' ? { ...asset, width: 640, height: 360 } : asset);
    });

    await expect(service.sync(manifest, noRetry)).rejects.toThrow(
      'Backdrop does not meet quality requirements',
    );
    expect(repository.upsertStagingItems).not.toHaveBeenCalled();
    expect(repository.publishRevision).not.toHaveBeenCalled();
  });

  it('leaves the previous published revision untouched when any item fails', async () => {
    const getSummaryByRef = jest.fn((mediaRef: string) =>
      Promise.resolve({
        summary: mediaRef === 'imdb:tt0000002' ? null : summary(mediaRef),
        meta: {},
      }),
    );
    const { service, repository } = setup({ getSummaryByRef });

    await expect(service.sync(manifest, noRetry)).rejects.toThrow(
      'No metadata found for imdb:tt0000002',
    );
    expect(repository.createStagingRevision).toHaveBeenCalledTimes(1);
    expect(repository.upsertStagingItems).not.toHaveBeenCalled();
    expect(repository.publishRevision).not.toHaveBeenCalled();
  });

  it('stops taking queued work after a failure and waits for the active worker', async () => {
    const getSummaryByRef = jest.fn((mediaRef: string) =>
      mediaRef === 'imdb:tt0000001'
        ? Promise.reject(new Error('first item failed'))
        : Promise.resolve({ summary: summary(mediaRef), meta: {} }),
    );
    const { service } = setup({ getSummaryByRef });

    await expect(service.sync(manifest, { concurrency: 1, retryDelaysMs: [] })).rejects.toThrow(
      'first item failed',
    );
    expect(getSummaryByRef).toHaveBeenCalledTimes(1);
  });

  it('validates the whole manifest before creating a staging revision', async () => {
    const { service, repository } = setup({});
    const invalid = structuredClone(manifest);
    invalid.homeCollections[0].mediaRefs[0] = 'file:///unsafe';

    await expect(service.sync(invalid, noRetry)).rejects.toThrow(
      'Invalid editorial catalog manifest',
    );
    expect(repository.findReusableRevision).not.toHaveBeenCalled();
    expect(repository.createStagingRevision).not.toHaveBeenCalled();
  });
});
