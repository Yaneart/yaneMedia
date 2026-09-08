import type { MediaRefType } from '../media-ref';

export const editorialCollectionIds = ['featured', 'editorial-picks'] as const;

export type EditorialCollectionId = (typeof editorialCollectionIds)[number];

export interface EditorialCatalogEntry {
  mediaRef: string;
  type: MediaRefType;
  catalogOrder: number;
  collections: readonly EditorialCollectionId[];
}

export interface MediaCatalogCollectionDefinition {
  id: string;
  title: string;
  mediaRefs: readonly string[];
}

export const mediaCatalogCollectionDefinitions: Record<
  MediaRefType,
  readonly MediaCatalogCollectionDefinition[]
> = {
  movie: [
    {
      id: 'editorial-picks',
      title: 'Выбор редакции',
      mediaRefs: [
        'imdb:tt15239678',
        'imdb:tt15398776',
        'imdb:tt2543164',
        'imdb:tt1856101',
        'imdb:tt0816692',
        'imdb:tt0468569',
        'imdb:tt6751668',
        'imdb:tt6710474',
        'imdb:tt1392190',
        'imdb:tt9362722',
      ],
    },
    {
      id: 'auteur-cinema',
      title: 'Авторское кино',
      mediaRefs: [
        'imdb:tt2278388',
        'imdb:tt9243804',
        'imdb:tt14230458',
        'imdb:tt14849194',
        'imdb:tt17009710',
        'imdb:tt1798709',
        'imdb:tt2562232',
        'imdb:tt7984734',
        'imdb:tt11813216',
        'imdb:tt3464902',
      ],
    },
    {
      id: 'timeless-classics',
      title: 'Классика вне времени',
      mediaRefs: [
        'imdb:tt0120737',
        'imdb:tt0133093',
        'imdb:tt1375666',
        'imdb:tt0482571',
        'imdb:tt0078748',
        'imdb:tt0084787',
        'imdb:tt0068646',
        'imdb:tt0110912',
        'imdb:tt0111161',
        'imdb:tt0050083',
      ],
    },
    {
      id: 'thrillers-and-mysteries',
      title: 'Триллеры и расследования',
      mediaRefs: [
        'imdb:tt1392214',
        'imdb:tt0114369',
        'imdb:tt0443706',
        'imdb:tt1130884',
        'imdb:tt2267998',
        'imdb:tt0209144',
        'imdb:tt0102926',
        'imdb:tt0364569',
        'imdb:tt0353969',
        'imdb:tt1255953',
      ],
    },
    {
      id: 'powerful-dramas',
      title: 'Сильные драмы',
      mediaRefs: [
        'imdb:tt2582802',
        'imdb:tt0469494',
        'imdb:tt4034228',
        'imdb:tt19770238',
        'imdb:tt10272386',
        'imdb:tt4975722',
        'imdb:tt0108052',
        'imdb:tt0405094',
        'imdb:tt8267604',
        'imdb:tt13238346',
      ],
    },
  ],
  series: [
    {
      id: 'editorial-picks',
      title: 'Выбор редакции',
      mediaRefs: [
        'imdb:tt11280740',
        'imdb:tt2788316',
        'imdb:tt7366338',
        'imdb:tt0903747',
        'imdb:tt3032476',
        'imdb:tt2356777',
        'imdb:tt7660850',
        'imdb:tt14452776',
        'imdb:tt5753856',
        'imdb:tt3581920',
      ],
    },
    {
      id: 'crime-and-investigation',
      title: 'Криминал и расследования',
      mediaRefs: [
        'imdb:tt2802850',
        'imdb:tt4158110',
        'imdb:tt5290382',
        'imdb:tt10155688',
        'imdb:tt0306414',
        'imdb:tt2401256',
        'imdb:tt2249364',
        'imdb:tt2243973',
        'imdb:tt5875444',
        'imdb:tt11016042',
      ],
    },
    {
      id: 'science-fiction-worlds',
      title: 'Фантастика и другие миры',
      mediaRefs: [
        'imdb:tt9253284',
        'imdb:tt11126994',
        'imdb:tt2699128',
        'imdb:tt3230854',
        'imdb:tt2085059',
        'imdb:tt14688458',
        'imdb:tt9813792',
        'imdb:tt0475784',
        'imdb:tt13016388',
        'imdb:tt12637874',
      ],
    },
    {
      id: 'historical-eras',
      title: 'Исторические эпохи',
      mediaRefs: [
        'imdb:tt4786824',
        'imdb:tt0185906',
        'imdb:tt0384766',
        'imdb:tt4179452',
        'imdb:tt2306299',
        'imdb:tt2442560',
        'imdb:tt0979432',
        'imdb:tt0348914',
        'imdb:tt8888462',
        'imdb:tt2708480',
      ],
    },
    {
      id: 'smart-comedies',
      title: 'Умные комедии',
      mediaRefs: [
        'imdb:tt5687612',
        'imdb:tt10986410',
        'imdb:tt5348176',
        'imdb:tt4288182',
        'imdb:tt4955642',
        'imdb:tt11815682',
        'imdb:tt7908628',
        'imdb:tt7120662',
        'imdb:tt15677150',
        'imdb:tt14403178',
      ],
    },
  ],
  anime: [
    {
      id: 'editorial-picks',
      title: 'Выбор редакции',
      mediaRefs: [
        'anilist:154587',
        'anilist:101348',
        'anilist:16498',
        'anilist:5114',
        'anilist:9253',
        'anilist:1',
        'anilist:21507',
        'anilist:97986',
        'anilist:128547',
        'anilist:120377',
      ],
    },
    {
      id: 'mystery-and-psychology',
      title: 'Тайны и психологические истории',
      mediaRefs: [
        'anilist:99088',
        'anilist:19',
        'anilist:1535',
        'anilist:13601',
        'anilist:21234',
        'anilist:101759',
        'anilist:323',
        'anilist:437',
        'anilist:339',
        'anilist:155783',
      ],
    },
    {
      id: 'warm-and-heartfelt',
      title: 'Тёплые и душевные истории',
      mediaRefs: [
        'anilist:21827',
        'anilist:130003',
        'anilist:199',
        'anilist:140960',
        'anilist:20954',
        'anilist:21366',
        'anilist:20722',
        'anilist:5680',
        'anilist:4081',
        'anilist:20665',
      ],
    },
    {
      id: 'modern-action',
      title: 'Экшен нового поколения',
      mediaRefs: [
        'anilist:127230',
        'anilist:113415',
        'anilist:101922',
        'anilist:151807',
        'anilist:128893',
        'anilist:153288',
        'anilist:21459',
        'anilist:21087',
        'anilist:171018',
        'anilist:98460',
      ],
    },
    {
      id: 'grand-adventures',
      title: 'Большие приключения',
      mediaRefs: [
        'anilist:11061',
        'anilist:21',
        'anilist:20',
        'anilist:457',
        'anilist:164',
        'anilist:153518',
        'anilist:113717',
        'anilist:151040',
        'anilist:205',
        'anilist:2001',
      ],
    },
  ],
};

const featuredMediaRefs = new Set([
  'imdb:tt15239678',
  'imdb:tt11280740',
  'imdb:tt15398776',
  'imdb:tt2788316',
  'imdb:tt2543164',
  'imdb:tt7366338',
]);

const featuredCollections = ['featured', 'editorial-picks'] as const;
const editorialCollections = ['editorial-picks'] as const;
const mediaTypes = ['movie', 'series', 'anime'] as const;

const entriesByType = Object.fromEntries(
  mediaTypes.map((type) => [
    type,
    mediaCatalogCollectionDefinitions[type]
      .flatMap((collection) => collection.mediaRefs)
      .map((mediaRef, index): EditorialCatalogEntry => ({
        mediaRef,
        type,
        catalogOrder: index + 1,
        collections: featuredMediaRefs.has(mediaRef) ? featuredCollections : editorialCollections,
      })),
  ]),
) as Record<MediaRefType, EditorialCatalogEntry[]>;

export const editorialCatalog: readonly EditorialCatalogEntry[] = Array.from(
  { length: entriesByType.movie.length },
  (_, index) => mediaTypes.map((type) => entriesByType[type][index]),
).flat();
