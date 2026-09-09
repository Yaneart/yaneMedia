import type { EditorialCollectionId } from '../catalog/editorial-catalog';

export const HOME_FEATURED_COLLECTION_ID = 'featured' satisfies EditorialCollectionId;

export interface HomeCollectionDefinition {
  id: string;
  title: string;
  mediaRefs: readonly string[];
  fullCollectionId?: EditorialCollectionId;
}

export const homeCollectionDefinitions: readonly HomeCollectionDefinition[] = [
  {
    id: 'home-editorial-picks',
    title: 'Выбор редакции',
    fullCollectionId: 'editorial-picks',
    mediaRefs: [
      'imdb:tt15239678',
      'imdb:tt11280740',
      'anilist:154587',
      'imdb:tt15398776',
      'imdb:tt2788316',
      'anilist:101348',
      'imdb:tt2543164',
      'imdb:tt7366338',
      'anilist:16498',
      'imdb:tt1856101',
    ],
  },
  {
    id: 'edge-of-your-seat',
    title: 'Держит в напряжении',
    mediaRefs: [
      'imdb:tt1392214',
      'imdb:tt2802850',
      'anilist:99088',
      'imdb:tt0114369',
      'imdb:tt5290382',
      'anilist:19',
      'imdb:tt0443706',
      'imdb:tt10155688',
      'anilist:1535',
      'imdb:tt2267998',
    ],
  },
  {
    id: 'beyond-the-familiar',
    title: 'За гранью привычного',
    mediaRefs: [
      'imdb:tt0133093',
      'imdb:tt9253284',
      'anilist:11061',
      'imdb:tt0078748',
      'imdb:tt11126994',
      'anilist:164',
      'imdb:tt0084787',
      'imdb:tt3230854',
      'anilist:153518',
      'imdb:tt0120737',
    ],
  },
  {
    id: 'stories-with-character',
    title: 'Истории с характером',
    mediaRefs: [
      'imdb:tt2582802',
      'imdb:tt4786824',
      'anilist:21827',
      'imdb:tt0469494',
      'imdb:tt0185906',
      'anilist:20954',
      'imdb:tt4034228',
      'imdb:tt0384766',
      'anilist:21366',
      'imdb:tt13238346',
    ],
  },
  {
    id: 'a-good-evening',
    title: 'Для хорошего вечера',
    mediaRefs: [
      'imdb:tt2278388',
      'imdb:tt5687612',
      'anilist:130003',
      'imdb:tt14230458',
      'imdb:tt10986410',
      'anilist:199',
      'imdb:tt14849194',
      'imdb:tt11815682',
      'anilist:140960',
      'imdb:tt1798709',
    ],
  },
];
