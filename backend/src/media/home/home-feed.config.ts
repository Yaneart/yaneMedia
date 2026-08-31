import type { EditorialCollectionId } from '../catalog/editorial-catalog';

export const HOME_FEATURED_COLLECTION_ID = 'featured' satisfies EditorialCollectionId;

export interface HomeCollectionDefinition {
  id: string;
  title: string;
  sourceCollectionId: EditorialCollectionId;
}

export const homeCollectionDefinitions = [
  {
    id: 'editorial-picks',
    title: 'Выбор редакции',
    sourceCollectionId: 'editorial-picks',
  },
] as const satisfies readonly HomeCollectionDefinition[];
