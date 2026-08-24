export interface MediaExternalIds {
  imdb?: string;
  kinopoisk?: string;
  shikimori?: string;
  aniList?: string;
  myAnimeList?: string;
}

export type MediaRefType = 'movie' | 'series' | 'anime';

export function createMediaRef(ids: MediaExternalIds, type?: MediaRefType): string | undefined {
  if (type === 'anime') {
    const animeRef = createAnimeMediaRef(ids);

    if (animeRef) {
      return animeRef;
    }
  }

  const imdb = ids.imdb?.trim();

  if (imdb && /^tt\d{7,12}$/.test(imdb)) {
    return `imdb:${imdb}`;
  }

  const kinopoisk = ids.kinopoisk?.trim();

  if (kinopoisk && /^\d{1,12}$/.test(kinopoisk)) {
    return `kinopoisk:${kinopoisk}`;
  }

  return type ? undefined : createAnimeMediaRef(ids);
}

export function resolveMediaRef(mediaRef: string): MediaExternalIds | undefined {
  const [source, id, extra] = mediaRef.split(':');

  if (!id || extra !== undefined) {
    return undefined;
  }

  if (source === 'imdb' && /^tt\d{7,12}$/.test(id)) {
    return { imdb: id };
  }

  if (source === 'kinopoisk' && /^\d{1,12}$/.test(id)) {
    return { kinopoisk: id };
  }

  if (source === 'shikimori' && /^\d{1,12}$/.test(id)) {
    return { shikimori: id };
  }

  if (source === 'anilist' && /^\d{1,12}$/.test(id)) {
    return { aniList: id };
  }

  if (source === 'myanimelist' && /^\d{1,12}$/.test(id)) {
    return { myAnimeList: id };
  }

  return undefined;
}

function createAnimeMediaRef(ids: MediaExternalIds): string | undefined {
  const shikimori = ids.shikimori?.trim();

  if (shikimori && /^\d{1,12}$/.test(shikimori)) {
    return `shikimori:${shikimori}`;
  }

  const aniList = ids.aniList?.trim();

  if (aniList && /^\d{1,12}$/.test(aniList)) {
    return `anilist:${aniList}`;
  }

  const myAnimeList = ids.myAnimeList?.trim();

  if (myAnimeList && /^\d{1,12}$/.test(myAnimeList)) {
    return `myanimelist:${myAnimeList}`;
  }

  return undefined;
}
