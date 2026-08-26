import {
  homeCollections,
  homeContinueWatching,
  homeFeaturedCandidates,
} from '../../src/media/home-feed.fixture';
import { resolveMediaRef } from '../../src/media/media-ref';

describe('home feed fixture', () => {
  it('contains four featured candidates with unique valid media refs', () => {
    const mediaRefs = homeFeaturedCandidates.map(({ mediaRef }) => mediaRef);

    expect(homeFeaturedCandidates).toHaveLength(4);
    expect(new Set(mediaRefs).size).toBe(mediaRefs.length);

    for (const mediaRef of mediaRefs) {
      expect(resolveMediaRef(mediaRef)).toBeDefined();
    }
  });

  it('provides a backdrop for every featured candidate', () => {
    for (const candidate of homeFeaturedCandidates) {
      expect(candidate.backdrop?.url).toBeTruthy();
      expect(candidate.backdrop?.width).toBeGreaterThan(0);
      expect(candidate.backdrop?.height).toBeGreaterThan(0);
    }
  });

  it('contains valid progress for each continue-watching item', () => {
    expect(homeContinueWatching).toHaveLength(3);
    expect(new Set(homeContinueWatching.map(({ media }) => media.mediaRef)).size).toBe(
      homeContinueWatching.length,
    );

    for (const { media, progress } of homeContinueWatching) {
      expect(resolveMediaRef(media.mediaRef)).toBeDefined();
      expect(progress.positionSeconds).toBeGreaterThanOrEqual(0);
      expect(progress.durationSeconds).toBeGreaterThan(0);
      expect(progress.positionSeconds).toBeLessThanOrEqual(progress.durationSeconds);
      expect(new Date(progress.updatedAt).toISOString()).toBe(progress.updatedAt);
    }
  });

  it('contains two non-empty collections with unique ids and valid media refs', () => {
    expect(homeCollections).toHaveLength(2);
    expect(new Set(homeCollections.map(({ id }) => id)).size).toBe(homeCollections.length);

    for (const collection of homeCollections) {
      expect(collection.id).toBeTruthy();
      expect(collection.title).toBeTruthy();
      expect(collection.items.length).toBeGreaterThan(0);

      for (const item of collection.items) {
        expect(resolveMediaRef(item.mediaRef)).toBeDefined();
      }
    }
  });
});
