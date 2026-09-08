export interface MediaExternalIds {
  imdb?: string;
  kinopoisk?: string;
  shikimori?: string;
  aniList?: string;
  myAnimeList?: string;
}

export type MediaRefType = 'movie' | 'series' | 'anime';

const knownAnimeRefGroups = [
  ['anilist:154587', 'shikimori:52991', 'myanimelist:52991'],
  ['anilist:101348', 'shikimori:37521', 'myanimelist:37521'],
  ['anilist:16498', 'shikimori:16498', 'myanimelist:16498'],
  ['anilist:5114', 'shikimori:5114', 'myanimelist:5114'],
  ['anilist:9253', 'shikimori:9253', 'myanimelist:9253'],
  ['anilist:1', 'shikimori:1', 'myanimelist:1'],
  ['anilist:21507', 'shikimori:32182', 'myanimelist:32182'],
  ['anilist:97986', 'shikimori:34599', 'myanimelist:34599'],
  ['anilist:128547', 'shikimori:46102', 'myanimelist:46102'],
  ['anilist:120377', 'shikimori:42310', 'myanimelist:42310'],
  ['anilist:21827', 'shikimori:33352', 'myanimelist:33352'],
  ['anilist:130003', 'shikimori:47917', 'myanimelist:47917'],
  ['anilist:127230', 'shikimori:44511', 'myanimelist:44511'],
  ['anilist:99088', 'shikimori:35737', 'myanimelist:35737'],
  ['anilist:19', 'shikimori:19', 'myanimelist:19'],
  ['anilist:1535', 'shikimori:1535', 'myanimelist:1535'],
  ['anilist:199', 'shikimori:199', 'myanimelist:199'],
  ['anilist:113415', 'shikimori:40748', 'myanimelist:40748'],
  ['anilist:101922', 'shikimori:38000', 'myanimelist:38000'],
  ['anilist:140960', 'shikimori:50265', 'myanimelist:50265'],
  ['anilist:13601', 'shikimori:13601', 'myanimelist:13601'],
  ['anilist:21234', 'shikimori:31043', 'myanimelist:31043'],
  ['anilist:101759', 'shikimori:37779', 'myanimelist:37779'],
  ['anilist:323', 'shikimori:323', 'myanimelist:323'],
  ['anilist:437', 'shikimori:437', 'myanimelist:437'],
  ['anilist:339', 'shikimori:339', 'myanimelist:339'],
  ['anilist:155783', 'shikimori:53393', 'myanimelist:53393'],
  ['anilist:20954', 'shikimori:28851', 'myanimelist:28851'],
  ['anilist:21366', 'shikimori:31646', 'myanimelist:31646'],
  ['anilist:20722', 'shikimori:22789', 'myanimelist:22789'],
  ['anilist:5680', 'shikimori:5680', 'myanimelist:5680'],
  ['anilist:4081', 'shikimori:4081', 'myanimelist:4081'],
  ['anilist:20665', 'shikimori:23273', 'myanimelist:23273'],
  ['anilist:151807', 'shikimori:52299', 'myanimelist:52299'],
  ['anilist:128893', 'shikimori:46569', 'myanimelist:46569'],
  ['anilist:153288', 'shikimori:52588', 'myanimelist:52588'],
  ['anilist:21459', 'shikimori:31964', 'myanimelist:31964'],
  ['anilist:21087', 'shikimori:30276', 'myanimelist:30276'],
  ['anilist:171018', 'shikimori:57334', 'myanimelist:57334'],
  ['anilist:98460', 'shikimori:35120', 'myanimelist:35120'],
  ['anilist:11061', 'shikimori:11061', 'myanimelist:11061'],
  ['anilist:21', 'shikimori:21', 'myanimelist:21'],
  ['anilist:20', 'shikimori:20', 'myanimelist:20'],
  ['anilist:457', 'shikimori:457', 'myanimelist:457'],
  ['anilist:164', 'shikimori:164', 'myanimelist:164'],
  ['anilist:153518', 'shikimori:52701', 'myanimelist:52701'],
  ['anilist:113717', 'shikimori:40834', 'myanimelist:40834'],
  ['anilist:151040', 'shikimori:52093', 'myanimelist:52093'],
  ['anilist:205', 'shikimori:205', 'myanimelist:205'],
  ['anilist:2001', 'shikimori:2001', 'myanimelist:2001'],
] as const;

const knownAnimeRefs = new Map(
  knownAnimeRefGroups.flatMap((group) => group.map((mediaRef) => [mediaRef, group] as const)),
);

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

export function resolveMediaRefWithAliases(mediaRef: string): MediaExternalIds | undefined {
  const requestedIds = resolveMediaRef(mediaRef);

  if (!requestedIds) {
    return undefined;
  }

  const aliases = knownAnimeRefs.get(mediaRef);

  if (!aliases) {
    return requestedIds;
  }

  return aliases.reduce<MediaExternalIds>(
    (ids, alias) => ({ ...ids, ...resolveMediaRef(alias) }),
    {},
  );
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
