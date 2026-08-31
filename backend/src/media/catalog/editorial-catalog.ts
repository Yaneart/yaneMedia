import type { MediaRefType } from '../media-ref';

export const editorialCollectionIds = ['featured', 'editorial-picks'] as const;

export type EditorialCollectionId = (typeof editorialCollectionIds)[number];

export interface EditorialCatalogEntry {
  mediaRef: string;
  type: MediaRefType;
  catalogOrder: number;
  collections: readonly EditorialCollectionId[];
}

const featuredCollections = ['featured', 'editorial-picks'] as const;
const editorialCollections = ['editorial-picks'] as const;

export const editorialCatalog = [
  { mediaRef: 'imdb:tt15239678', type: 'movie', catalogOrder: 1, collections: featuredCollections },
  {
    mediaRef: 'imdb:tt11280740',
    type: 'series',
    catalogOrder: 1,
    collections: featuredCollections,
  },
  { mediaRef: 'anilist:154587', type: 'anime', catalogOrder: 1, collections: editorialCollections },
  { mediaRef: 'imdb:tt15398776', type: 'movie', catalogOrder: 2, collections: featuredCollections },
  { mediaRef: 'imdb:tt2788316', type: 'series', catalogOrder: 2, collections: featuredCollections },
  { mediaRef: 'anilist:101348', type: 'anime', catalogOrder: 2, collections: editorialCollections },
  { mediaRef: 'imdb:tt2543164', type: 'movie', catalogOrder: 3, collections: featuredCollections },
  { mediaRef: 'imdb:tt7366338', type: 'series', catalogOrder: 3, collections: featuredCollections },
  { mediaRef: 'anilist:16498', type: 'anime', catalogOrder: 3, collections: editorialCollections },
  { mediaRef: 'imdb:tt1856101', type: 'movie', catalogOrder: 4, collections: featuredCollections },
  {
    mediaRef: 'imdb:tt0903747',
    type: 'series',
    catalogOrder: 4,
    collections: editorialCollections,
  },
  { mediaRef: 'anilist:5114', type: 'anime', catalogOrder: 4, collections: editorialCollections },
  { mediaRef: 'imdb:tt0816692', type: 'movie', catalogOrder: 5, collections: editorialCollections },
  {
    mediaRef: 'imdb:tt3032476',
    type: 'series',
    catalogOrder: 5,
    collections: editorialCollections,
  },
  { mediaRef: 'anilist:9253', type: 'anime', catalogOrder: 5, collections: editorialCollections },
  { mediaRef: 'imdb:tt0468569', type: 'movie', catalogOrder: 6, collections: editorialCollections },
  {
    mediaRef: 'imdb:tt2356777',
    type: 'series',
    catalogOrder: 6,
    collections: editorialCollections,
  },
  { mediaRef: 'anilist:1', type: 'anime', catalogOrder: 6, collections: editorialCollections },
  { mediaRef: 'imdb:tt6751668', type: 'movie', catalogOrder: 7, collections: editorialCollections },
  {
    mediaRef: 'imdb:tt7660850',
    type: 'series',
    catalogOrder: 7,
    collections: editorialCollections,
  },
  { mediaRef: 'anilist:21507', type: 'anime', catalogOrder: 7, collections: editorialCollections },
  { mediaRef: 'imdb:tt6710474', type: 'movie', catalogOrder: 8, collections: editorialCollections },
  {
    mediaRef: 'imdb:tt14452776',
    type: 'series',
    catalogOrder: 8,
    collections: editorialCollections,
  },
  { mediaRef: 'anilist:97986', type: 'anime', catalogOrder: 8, collections: editorialCollections },
  { mediaRef: 'imdb:tt1392190', type: 'movie', catalogOrder: 9, collections: editorialCollections },
  {
    mediaRef: 'imdb:tt5753856',
    type: 'series',
    catalogOrder: 9,
    collections: editorialCollections,
  },
  { mediaRef: 'anilist:128547', type: 'anime', catalogOrder: 9, collections: editorialCollections },
  {
    mediaRef: 'imdb:tt9362722',
    type: 'movie',
    catalogOrder: 10,
    collections: editorialCollections,
  },
  {
    mediaRef: 'imdb:tt3581920',
    type: 'series',
    catalogOrder: 10,
    collections: editorialCollections,
  },
  {
    mediaRef: 'anilist:120377',
    type: 'anime',
    catalogOrder: 10,
    collections: editorialCollections,
  },
  {
    mediaRef: 'imdb:tt2278388',
    type: 'movie',
    catalogOrder: 11,
    collections: editorialCollections,
  },
  {
    mediaRef: 'imdb:tt9253284',
    type: 'series',
    catalogOrder: 11,
    collections: editorialCollections,
  },
  { mediaRef: 'anilist:21827', type: 'anime', catalogOrder: 11, collections: editorialCollections },
  {
    mediaRef: 'imdb:tt2582802',
    type: 'movie',
    catalogOrder: 12,
    collections: editorialCollections,
  },
  {
    mediaRef: 'imdb:tt11126994',
    type: 'series',
    catalogOrder: 12,
    collections: editorialCollections,
  },
  {
    mediaRef: 'anilist:130003',
    type: 'anime',
    catalogOrder: 12,
    collections: editorialCollections,
  },
  {
    mediaRef: 'imdb:tt0120737',
    type: 'movie',
    catalogOrder: 13,
    collections: editorialCollections,
  },
  {
    mediaRef: 'imdb:tt2802850',
    type: 'series',
    catalogOrder: 13,
    collections: editorialCollections,
  },
  {
    mediaRef: 'anilist:127230',
    type: 'anime',
    catalogOrder: 13,
    collections: editorialCollections,
  },
  {
    mediaRef: 'imdb:tt0133093',
    type: 'movie',
    catalogOrder: 14,
    collections: editorialCollections,
  },
  {
    mediaRef: 'imdb:tt4158110',
    type: 'series',
    catalogOrder: 14,
    collections: editorialCollections,
  },
  { mediaRef: 'anilist:99088', type: 'anime', catalogOrder: 14, collections: editorialCollections },
  {
    mediaRef: 'imdb:tt1375666',
    type: 'movie',
    catalogOrder: 15,
    collections: editorialCollections,
  },
  {
    mediaRef: 'imdb:tt2699128',
    type: 'series',
    catalogOrder: 15,
    collections: editorialCollections,
  },
  { mediaRef: 'anilist:19', type: 'anime', catalogOrder: 15, collections: editorialCollections },
  {
    mediaRef: 'imdb:tt0482571',
    type: 'movie',
    catalogOrder: 16,
    collections: editorialCollections,
  },
  {
    mediaRef: 'imdb:tt9243804',
    type: 'movie',
    catalogOrder: 17,
    collections: editorialCollections,
  },
  {
    mediaRef: 'imdb:tt14230458',
    type: 'movie',
    catalogOrder: 18,
    collections: editorialCollections,
  },
  {
    mediaRef: 'imdb:tt14849194',
    type: 'movie',
    catalogOrder: 19,
    collections: editorialCollections,
  },
  {
    mediaRef: 'imdb:tt17009710',
    type: 'movie',
    catalogOrder: 20,
    collections: editorialCollections,
  },
] as const satisfies readonly EditorialCatalogEntry[];
