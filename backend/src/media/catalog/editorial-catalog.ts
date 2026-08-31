import type { MediaRefType } from '../media-ref';

export const editorialCollectionIds = ['featured', 'editorial-picks'] as const;

export type EditorialCollectionId = (typeof editorialCollectionIds)[number];

export interface EditorialCatalogEntry {
  mediaRef: string;
  type: MediaRefType;
  catalogOrder: number;
  collections: readonly EditorialCollectionId[];
}

export const editorialCatalog = [
  {
    mediaRef: 'imdb:tt15239678',
    type: 'movie',
    catalogOrder: 1,
    collections: ['featured', 'editorial-picks'],
  },
  {
    mediaRef: 'imdb:tt15398776',
    type: 'movie',
    catalogOrder: 2,
    collections: ['editorial-picks'],
  },
  {
    mediaRef: 'imdb:tt11280740',
    type: 'series',
    catalogOrder: 1,
    collections: ['featured', 'editorial-picks'],
  },
  {
    mediaRef: 'imdb:tt2788316',
    type: 'series',
    catalogOrder: 2,
    collections: ['featured', 'editorial-picks'],
  },
  {
    mediaRef: 'anilist:154587',
    type: 'anime',
    catalogOrder: 1,
    collections: ['featured', 'editorial-picks'],
  },
  {
    mediaRef: 'anilist:101348',
    type: 'anime',
    catalogOrder: 2,
    collections: ['editorial-picks'],
  },
] as const satisfies readonly EditorialCatalogEntry[];
