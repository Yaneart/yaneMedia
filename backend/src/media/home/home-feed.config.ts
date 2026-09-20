import {
  editorialManifest,
  type EditorialCollectionId,
  type HomeCollectionManifest,
} from '../catalog/editorial-catalog';

export const HOME_FEATURED_COLLECTION_ID = 'featured' satisfies EditorialCollectionId;
export type HomeCollectionDefinition = HomeCollectionManifest;
export const homeCollectionDefinitions: readonly HomeCollectionDefinition[] =
  editorialManifest.homeCollections;
