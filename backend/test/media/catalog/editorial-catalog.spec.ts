import {
  editorialCatalog,
  editorialCollectionIds,
} from '../../../src/media/catalog/editorial-catalog';
import { resolveMediaRef } from '../../../src/media/media-ref';

describe('editorial catalog', () => {
  it('contains only stable configuration fields and valid unique media refs', () => {
    const mediaRefs = editorialCatalog.map(({ mediaRef }) => mediaRef);

    expect(new Set(mediaRefs).size).toBe(mediaRefs.length);

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

  it('has a unique order and at least one entry for every supported media type', () => {
    for (const type of ['movie', 'series', 'anime'] as const) {
      const entries = editorialCatalog.filter((entry) => entry.type === type);
      const orders = entries.map(({ catalogOrder }) => catalogOrder);

      expect(entries.length).toBeGreaterThan(0);
      expect(new Set(orders).size).toBe(orders.length);
    }
  });
});
