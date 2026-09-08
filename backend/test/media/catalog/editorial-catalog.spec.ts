import {
  editorialCatalog,
  editorialCollectionIds,
  mediaCatalogCollectionDefinitions,
} from '../../../src/media/catalog/editorial-catalog';
import { resolveMediaRef, resolveMediaRefWithAliases } from '../../../src/media/media-ref';

describe('editorial catalog', () => {
  it('contains only stable configuration fields and valid unique media refs', () => {
    const mediaRefs = editorialCatalog.map(({ mediaRef }) => mediaRef);

    expect(new Set(mediaRefs).size).toBe(mediaRefs.length);
    expect(mediaRefs).toHaveLength(150);

    for (const entry of editorialCatalog) {
      expect(Object.keys(entry).sort()).toEqual([
        'catalogOrder',
        'collections',
        'mediaRef',
        'type',
      ]);
      expect(resolveMediaRef(entry.mediaRef)).toBeDefined();
      expect(entry.catalogOrder).toBeGreaterThan(0);

      for (const collectionId of entry.collections) {
        expect(editorialCollectionIds).toContain(collectionId);
      }
    }
  });

  it('has fifty distinctly ordered entries for every supported media type', () => {
    for (const type of ['movie', 'series', 'anime'] as const) {
      const entries = editorialCatalog.filter((entry) => entry.type === type);
      const orders = entries.map(({ catalogOrder }) => catalogOrder);

      expect(entries).toHaveLength(50);
      expect(new Set(orders).size).toBe(orders.length);
    }
  });

  it('defines five ten-item collections with no cross-collection duplicates', () => {
    for (const type of ['movie', 'series', 'anime'] as const) {
      const collections = mediaCatalogCollectionDefinitions[type];

      expect(collections).toHaveLength(5);
      expect(collections[0].title).toBe('Выбор редакции');

      for (const collection of collections) {
        expect(collection.mediaRefs).toHaveLength(10);
        expect(new Set(collection.mediaRefs).size).toBe(10);
      }

      for (let leftIndex = 0; leftIndex < collections.length; leftIndex += 1) {
        const leftRefs = new Set(collections[leftIndex].mediaRefs);

        for (let rightIndex = leftIndex + 1; rightIndex < collections.length; rightIndex += 1) {
          const overlap = collections[rightIndex].mediaRefs.filter((mediaRef) =>
            leftRefs.has(mediaRef),
          );

          expect(overlap).toHaveLength(0);
        }
      }
    }
  });

  it('gives editorial anime IDs for both metadata providers', () => {
    const animeEntries = editorialCatalog.filter(({ type }) => type === 'anime');

    for (const entry of animeEntries) {
      const ids = resolveMediaRefWithAliases(entry.mediaRef);

      expect(ids?.aniList).toBeDefined();
      expect(ids?.shikimori).toBeDefined();
    }
  });

  it('keeps editorial movies and series on shared IMDb references', () => {
    const movieAndSeriesEntries = editorialCatalog.filter(({ type }) => type !== 'anime');

    expect(movieAndSeriesEntries.every(({ mediaRef }) => mediaRef.startsWith('imdb:'))).toBe(true);
  });

  it('keeps anime out of the home featured collection', () => {
    const featuredEntries = editorialCatalog.filter(({ collections }) =>
      (collections as readonly string[]).includes('featured'),
    );

    expect(featuredEntries.length).toBeGreaterThan(0);
    expect(featuredEntries.every(({ type }) => type === 'movie' || type === 'series')).toBe(true);
    expect(featuredEntries.every((entry) => editorialCatalog.indexOf(entry) < 10)).toBe(true);
  });
});
