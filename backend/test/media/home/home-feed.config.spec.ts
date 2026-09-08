import {
  editorialCatalog,
  editorialCollectionIds,
} from '../../../src/media/catalog/editorial-catalog';
import {
  HOME_FEATURED_COLLECTION_ID,
  homeCollectionDefinitions,
} from '../../../src/media/home/home-feed.config';

describe('home feed configuration', () => {
  it('defines five mixed collections without repeated media', () => {
    const catalogTypeByRef = new Map(
      editorialCatalog.map(({ mediaRef, type }) => [mediaRef, type]),
    );
    const mediaRefs = homeCollectionDefinitions.flatMap((collection) => collection.mediaRefs);

    expect(editorialCollectionIds).toContain(HOME_FEATURED_COLLECTION_ID);
    expect(homeCollectionDefinitions).toHaveLength(5);
    expect(mediaRefs).toHaveLength(50);
    expect(new Set(mediaRefs).size).toBe(mediaRefs.length);

    for (const definition of homeCollectionDefinitions) {
      expect(definition.mediaRefs).toHaveLength(10);
      expect(
        new Set(definition.mediaRefs.map((mediaRef) => catalogTypeByRef.get(mediaRef))),
      ).toEqual(new Set(['movie', 'series', 'anime']));
      expect(definition.mediaRefs.every((mediaRef) => catalogTypeByRef.has(mediaRef))).toBe(true);
      expect(definition.title).not.toMatch(/популяр|рекоменд|сейчас смотрят/i);
    }
  });
});
