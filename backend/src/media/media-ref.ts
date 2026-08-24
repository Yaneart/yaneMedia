export interface MediaExternalIds {
  imdb?: string;
  kinopoisk?: string;
}

export function createMediaRef(ids: MediaExternalIds): string | undefined {
  const imdb = ids.imdb?.trim();

  if (imdb && /^tt\d{7,12}$/.test(imdb)) {
    return `imdb:${imdb}`;
  }

  const kinopoisk = ids.kinopoisk?.trim();

  if (kinopoisk && /^\d{1,12}$/.test(kinopoisk)) {
    return `kinopoisk:${kinopoisk}`;
  }

  return undefined;
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

  return undefined;
}
