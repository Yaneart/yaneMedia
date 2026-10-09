const baseUrl = (process.env.MEDIA_PROBE_BASE_URL ?? 'http://localhost:3000/api/v1').replace(
  /\/+$/,
  '',
);
const timeoutMs = 120_000;
const concurrency = 4;

const cases = [
  ['anime', 'One Piece', 1999],
  ['anime', 'Death Note', 2006],
  ['anime', 'Sousou no Frieren', 2023],
  ['anime', 'Solo Leveling', 2024],
  ['anime', 'Jujutsu Kaisen', 2020],
  ['anime', 'Naruto', 2002],
  ['anime', 'Shingeki no Kyojin', 2013],
  ['anime', 'Kimetsu no Yaiba', 2019],
  ['anime', 'Fullmetal Alchemist Brotherhood', 2009],
  ['anime', 'Spy x Family', 2022],
  ['series', 'Игра престолов', 2011],
  ['series', 'Во все тяжкие', 2008],
  ['series', 'Сёгун', 2024],
  ['series', 'Чернобыль', 2019],
  ['series', 'Пространство', 2015],
  ['series', 'Аркейн', 2021],
  ['series', 'Охотник за разумом', 2017],
  ['series', 'Шерлок', 2010],
  ['series', 'Одни из нас', 2023],
  ['series', 'Очень странные дела', 2016],
  ['movie', 'Паразиты', 2019],
  ['movie', 'Интерстеллар', 2014],
  ['movie', 'Начало', 2010],
  ['movie', 'Престиж', 2006],
  ['movie', 'Человек-паук: Через вселенные', 2018],
  ['movie', 'Матрица', 1999],
  ['movie', 'Бойцовский клуб', 1999],
  ['movie', 'Крёстный отец', 1972],
  ['movie', 'Остров проклятых', 2010],
  ['movie', 'Дюна', 2021],
].map(([type, query, year]) => ({ type, query, year }));

async function request(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(`${response.status} ${body.error?.message ?? response.statusText}`);
  return body.data ?? body;
}

function collectSources(availability) {
  return [
    ...(availability.sources ?? []),
    ...(availability.episodes ?? []).flatMap((episode) => episode.sources ?? []),
  ];
}

function selectEpisode(type, detailsResponse, baseAvailability) {
  if (type === 'movie') return null;

  if (type === 'series') {
    const catalogEpisode = (baseAvailability.episodes ?? []).find(
      (episode) => episode.seasonNumber > 0 && episode.episodeNumber > 0,
    );
    if (catalogEpisode) {
      return {
        seasonNumber: catalogEpisode.seasonNumber,
        episodeNumber: catalogEpisode.episodeNumber,
      };
    }
    const season = detailsResponse.details.seasons?.find((item) => item.number > 0);
    return season ? { seasonNumber: season.number, episodeNumber: 1 } : null;
  }

  const episode = detailsResponse.details.episodes?.find((item) => item.episodeNumber > 0);
  if (!episode) return null;
  const release = detailsResponse.animeSeasonChain?.find(
    (item) => item.mediaRef === detailsResponse.details.mediaRef,
  );
  return {
    seasonNumber: release?.number ?? 1,
    episodeNumber: (release?.seasonEpisodeOffset ?? 0) + episode.episodeNumber,
    absoluteEpisodeNumber:
      (release?.absoluteEpisodeOffset ?? 0) +
      (episode.absoluteEpisodeNumber ?? episode.episodeNumber),
  };
}

function availabilityPath(mediaRef, episode) {
  const path = `/media/${encodeURIComponent(mediaRef)}/availability`;
  if (!episode) return path;
  const parameters = new URLSearchParams(
    Object.entries(episode).map(([key, value]) => [key, String(value)]),
  );
  return `${path}?${parameters}`;
}

async function probe(testCase) {
  const startedAt = performance.now();
  const search = await request(
    `/media/search?query=${encodeURIComponent(testCase.query)}&type=${testCase.type}&limit=20`,
  );
  const item = search.find(
    (candidate) => candidate.type === testCase.type && candidate.year === testCase.year,
  );
  if (!item) return { ...testCase, status: 'search-miss' };

  const details = await request(`/media/${encodeURIComponent(item.mediaRef)}`);
  const baseAvailability = await request(availabilityPath(item.mediaRef));
  const episode = selectEpisode(testCase.type, details, baseAvailability);
  const availability = episode
    ? await request(availabilityPath(item.mediaRef, episode))
    : baseAvailability;
  const sources = collectSources(availability);
  const kodik = sources.filter((source) => source.provider === 'kodik-streaming');

  return {
    ...testCase,
    title: item.title,
    mediaRef: item.mediaRef,
    status: 'ok',
    episode,
    kodik: kodik.length > 0,
    kodikCount: kodik.length,
    providers: [...new Set(sources.map((source) => source.provider))].sort(),
    durationMs: Math.round(performance.now() - startedAt),
  };
}

async function worker(queue, results) {
  while (queue.length > 0) {
    const testCase = queue.shift();
    if (!testCase) return;
    try {
      const result = await probe(testCase);
      results.push(result);
      console.log(JSON.stringify(result));
    } catch (error) {
      const result = {
        ...testCase,
        status: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
      results.push(result);
      console.log(JSON.stringify(result));
    }
  }
}

const queue = [...cases];
const results = [];
await Promise.all(Array.from({ length: concurrency }, () => worker(queue, results)));

const summary = Object.fromEntries(
  ['anime', 'series', 'movie'].map((type) => {
    const typeResults = results.filter((result) => result.type === type);
    return [
      type,
      {
        tested: typeResults.length,
        kodik: typeResults.filter((result) => result.kodik).length,
        misses: typeResults.filter((result) => result.status !== 'ok').length,
      },
    ];
  }),
);
console.log(JSON.stringify({ summary }));

if (!results.some((result) => result.query === 'One Piece' && result.kodik)) {
  process.exitCode = 1;
}
