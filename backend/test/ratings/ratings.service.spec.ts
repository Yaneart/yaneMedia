import { BadRequestException } from '@nestjs/common';
import type { MediaCatalogService } from '../../src/media/catalog/media-catalog.service';
import { RatingsService } from '../../src/ratings/ratings.service';
import type { RatingsRepository } from '../../src/ratings/ratings.repository';

describe('RatingsService', () => {
  const media = {
    mediaRef: 'work_00000000-0000-4000-8000-000000000001',
    slug: 'dune-part-two',
    type: 'movie' as const,
    title: 'Dune: Part Two',
    genres: [],
    rating: 8.7,
  };
  const stored = {
    userId: '93ea2794-e805-4f60-b14f-2005d2c61804',
    mediaRef: media.mediaRef,
    value: 9,
    createdAt: new Date('2026-10-12T10:00:00.000Z'),
    updatedAt: new Date('2026-10-12T10:00:00.000Z'),
  };
  const find = jest.fn();
  const upsert = jest.fn();
  const remove = jest.fn();
  const findPublicDistribution = jest.fn();
  const resolveMediaRefs = jest.fn();
  const service = new RatingsService(
    { find, upsert, delete: remove, findPublicDistribution } as unknown as RatingsRepository,
    { resolveMediaRefs } as unknown as MediaCatalogService,
  );

  beforeEach(() => {
    find.mockReset().mockResolvedValue(stored);
    upsert.mockReset().mockResolvedValue(stored);
    remove.mockReset().mockResolvedValue(undefined);
    findPublicDistribution.mockReset().mockResolvedValue([]);
    resolveMediaRefs.mockReset().mockResolvedValue({
      items: [media],
      matches: [{ requestIndex: 0, item: media }],
      partial: false,
      degraded: false,
      stale: false,
    });
  });

  it('uses the canonical summary identity for external locators', async () => {
    await expect(service.upsert(stored.userId, 'imdb:tt15239678', 9)).resolves.toEqual({
      media,
      value: 9,
      createdAt: stored.createdAt.toISOString(),
      updatedAt: stored.updatedAt.toISOString(),
    });
    expect(upsert).toHaveBeenCalledWith(stored.userId, media.mediaRef, 9);
  });

  it('returns null only after resolving a known work', async () => {
    find.mockResolvedValue(undefined);
    await expect(service.getOwn(stored.userId, media.mediaRef)).resolves.toEqual({ rating: null });
    expect(find).toHaveBeenCalledWith(stored.userId, media.mediaRef);
  });

  it('returns a stable error for an unknown work without touching ratings', async () => {
    resolveMediaRefs.mockResolvedValue({
      items: [],
      matches: [],
      partial: true,
      degraded: true,
      stale: false,
    });
    await expect(service.getOwn(stored.userId, 'imdb:tt0000001')).rejects.toMatchObject({
      response: { code: 'MEDIA_NOT_FOUND' },
    });
    expect(find).not.toHaveBeenCalled();
  });

  it('normalizes an unknown canonical work error from media resolution', async () => {
    resolveMediaRefs.mockRejectedValue(new BadRequestException('Invalid media reference'));
    await expect(service.getSummary(media.mediaRef)).rejects.toMatchObject({
      response: { code: 'MEDIA_NOT_FOUND' },
    });
    expect(findPublicDistribution).not.toHaveBeenCalled();
  });

  it('deletes only the current user canonical rating', async () => {
    await service.delete(stored.userId, 'imdb:tt15239678');
    expect(remove).toHaveBeenCalledWith(stored.userId, media.mediaRef);
  });

  it('computes the public aggregate without altering the external media rating', async () => {
    findPublicDistribution.mockResolvedValue([
      { value: 10, count: 2 },
      { value: 7, count: 1 },
    ]);
    await expect(service.getSummary(media.mediaRef)).resolves.toMatchObject({
      average: 9,
      count: 3,
      distribution: { '7': 1, '10': 2 },
    });
    expect(media.rating).toBe(8.7);
  });

  it('returns a complete empty distribution', async () => {
    await expect(service.getSummary(media.mediaRef)).resolves.toEqual({
      average: null,
      count: 0,
      distribution: Object.fromEntries(Array.from({ length: 10 }, (_, index) => [index + 1, 0])),
    });
  });
});
