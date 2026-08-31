import { editorialCollectionIds } from '../../../src/media/catalog/editorial-catalog';
import {
  HOME_FEATURED_COLLECTION_ID,
  homeCollectionDefinitions,
} from '../../../src/media/home/home-feed.config';

describe('home feed configuration', () => {
  it('uses known editorial collections and honest public labels', () => {
    expect(editorialCollectionIds).toContain(HOME_FEATURED_COLLECTION_ID);
    expect(homeCollectionDefinitions).toEqual([
      {
        id: 'editorial-picks',
        title: 'Выбор редакции',
        sourceCollectionId: 'editorial-picks',
      },
    ]);

    for (const definition of homeCollectionDefinitions) {
      expect(editorialCollectionIds).toContain(definition.sourceCollectionId);
      expect(definition.title).not.toMatch(/популяр|рекоменд|сейчас смотрят/i);
    }
  });
});
