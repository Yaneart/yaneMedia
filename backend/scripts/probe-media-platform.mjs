const baseUrl = (process.env.MEDIA_PROBE_BASE_URL ?? 'http://localhost:3000/api/v1').replace(
  /\/+$/,
  '',
);
const timeoutMs = 120_000;

const scenarios = [
  {
    name: 'death-note',
    searches: ['Тетрадь смерти', 'Death Note'],
    type: 'anime',
    year: 2006,
    expectPlayback: true,
  },
  {
    name: 'frieren',
    searches: ['Фрирен'],
    type: 'anime',
    year: 2023,
    expectPlayback: true,
  },
  {
    name: 'spirited-away',
    searches: ['Унесённые призраками'],
    type: 'anime',
    year: 2001,
    expectDirect: true,
  },
  {
    name: 'game-of-thrones',
    searches: ['Игра престолов', 'Game of Thrones'],
    type: 'series',
    year: 2011,
    expectPlayback: true,
  },
  {
    name: 'shogun',
    searches: ['Shogun'],
    type: 'series',
    year: 2024,
    expectPlayback: true,
  },
  {
    name: 'interstellar',
    searches: ['Интерстеллар'],
    type: 'movie',
    year: 2014,
    expectDirect: true,
    expectEmbed: true,
  },
  {
    name: 'breaking-bad',
    searches: ['Во все тяжкие'],
    type: 'series',
    year: 2008,
    expectDirect: true,
    expectEmbed: true,
  },
];

const delay = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs));

async function request(path, init) {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: { accept: 'application/json', ...init?.headers },
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const body = await response.json();

      if (response.ok) return body.data ?? body;
      lastError = new Error(`${response.status} ${body.error?.message ?? response.statusText}`);
      if (response.status < 500) throw lastError;
    } catch (error) {
      lastError = error;
    }

    if (attempt < 3) await delay(attempt * 1_500);
  }

  throw lastError;
}

function selectSearchResult(results, scenario) {
  return results.find((item) => item.type === scenario.type && item.year === scenario.year);
}

async function search(query, scenario) {
  const params = new URLSearchParams({ query, type: scenario.type, limit: '20' });
  const results = await request(`/media/search?${params}`);
  const match = selectSearchResult(results, scenario);

  if (!match) {
    throw new Error(`No ${scenario.type} ${scenario.year} result for ${scenario.name}`);
  }

  return match;
}

function firstEpisode(details) {
  const episodes =
    details.type === 'series'
      ? (details.seasons ?? []).flatMap((season) => season.episodes ?? [])
      : details.type === 'anime'
        ? (details.episodes ?? [])
        : [];

  return episodes.find(
    (episode) => Number.isInteger(episode.episodeNumber) && episode.episodeNumber > 0,
  );
}

function availabilityQuery(detailsResponse) {
  const { details, animeSeasonChain = [] } = detailsResponse;

  if (details.type === 'movie' || (details.type === 'anime' && details.animeKind !== 'tv')) {
    return '';
  }

  const episode = firstEpisode(details);

  if (!episode) return '';

  let seasonNumber = episode.seasonNumber ?? 1;
  let episodeNumber = episode.episodeNumber;
  let absoluteEpisodeNumber = episode.absoluteEpisodeNumber;

  if (details.type === 'anime') {
    const release = animeSeasonChain.find((entry) => entry.mediaRef === details.mediaRef);
    seasonNumber = release?.number ?? seasonNumber;
    episodeNumber = (release?.seasonEpisodeOffset ?? 0) + episode.episodeNumber;
    absoluteEpisodeNumber = (release?.absoluteEpisodeOffset ?? 0) + episode.episodeNumber;
  }

  const params = new URLSearchParams({
    seasonNumber: String(seasonNumber),
    episodeNumber: String(episodeNumber),
  });
  if (Number.isInteger(absoluteEpisodeNumber)) {
    params.set('absoluteEpisodeNumber', String(absoluteEpisodeNumber));
  }

  return `?${params}`;
}

function playbackSummary(availabilities) {
  const sources = availabilities.flatMap((availability) => [
    ...(availability.sources ?? []),
    ...(availability.episodes ?? []).flatMap((episode) => episode.sources ?? []),
  ]);
  const kinds = new Set(sources.map((source) => source.kind));

  return {
    sources: sources.length,
    providers: [...new Set(sources.map((source) => source.provider))].sort(),
    kinds: [...kinds].sort(),
    degraded: availabilities.some((availability) => availability.degraded),
    hasDirect: kinds.has('hls') || kinds.has('mp4'),
    hasEmbed: kinds.has('embed'),
  };
}

async function probeScenario(scenario) {
  const startedAt = performance.now();
  const searchResults = [];

  for (const query of scenario.searches) searchResults.push(await search(query, scenario));

  const canonicalRefs = new Set(searchResults.map((item) => item.mediaRef));
  if (canonicalRefs.size !== 1) throw new Error(`Alias searches split ${scenario.name}`);

  const mediaRef = searchResults[0].mediaRef;
  const detailsResponse = await request(`/media/${encodeURIComponent(mediaRef)}`);
  if (detailsResponse.details.mediaRef !== mediaRef) {
    throw new Error(`Details changed canonical ref for ${scenario.name}`);
  }

  const availabilityPath = `/media/${encodeURIComponent(mediaRef)}/availability`;
  const episodeQuery = availabilityQuery(detailsResponse);
  const availabilities = [await request(availabilityPath)];
  if (episodeQuery) availabilities.push(await request(`${availabilityPath}${episodeQuery}`));
  const playback = playbackSummary(availabilities);

  if (scenario.expectPlayback && playback.sources === 0) {
    throw new Error(`No playback sources for ${scenario.name}`);
  }
  if (scenario.expectDirect && !playback.hasDirect) {
    throw new Error(`No direct source for ${scenario.name}`);
  }
  if (scenario.expectEmbed && !playback.hasEmbed) {
    throw new Error(`No embed source for ${scenario.name}`);
  }

  return {
    name: scenario.name,
    mediaRef,
    aliasesCanonical: canonicalRefs.size === 1,
    details: detailsResponse.details.title,
    playback,
    durationMs: Math.round(performance.now() - startedAt),
  };
}

async function probeSearchTail() {
  const first = await request('/media/search?genre=Drama&offset=0&limit=49');
  const second = await request('/media/search?genre=Drama&offset=48&limit=49');
  const firstVisible = first.slice(0, 48);
  const firstRefs = new Set(firstVisible.map((item) => item.mediaRef));
  const secondVisible = second.slice(0, 48);
  const uniqueTail = secondVisible.filter((item) => !firstRefs.has(item.mediaRef));

  if (first.length < 49 || uniqueTail.length === 0) {
    throw new Error('Search results after the first 48 are not reachable');
  }

  return {
    firstVisible: firstVisible.length,
    secondVisible: secondVisible.length,
    uniqueTail: uniqueTail.length,
  };
}

const results = [];
let failed = false;

try {
  const searchTail = await probeSearchTail();
  console.log(JSON.stringify({ name: 'search-tail', result: 'PASS', ...searchTail }));
} catch (error) {
  failed = true;
  console.log(JSON.stringify({ name: 'search-tail', result: 'FAIL', error: error.message }));
}

for (const scenario of scenarios) {
  try {
    const result = await probeScenario(scenario);
    results.push(result);
    console.log(JSON.stringify({ ...result, result: 'PASS' }));
  } catch (error) {
    failed = true;
    console.log(
      JSON.stringify({
        name: scenario.name,
        result: 'FAIL',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    );
  }
}

if (results.length > 0) {
  try {
    const mediaRefs = results.map(({ mediaRef }) => mediaRef);
    const resolution = await request('/media/summaries/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mediaRefs }),
    });
    const canonical = resolution.matches.every(
      (match) => match.item.mediaRef === mediaRefs[match.requestIndex],
    );

    if (resolution.matches.length !== mediaRefs.length || !canonical) {
      throw new Error('Canonical pre-save resolution is incomplete');
    }

    console.log(
      JSON.stringify({
        name: 'canonical-pre-save',
        result: 'PASS',
        requested: mediaRefs.length,
        unique: resolution.items.length,
      }),
    );
  } catch (error) {
    failed = true;
    console.log(
      JSON.stringify({
        name: 'canonical-pre-save',
        result: 'FAIL',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    );
  }
}

if (failed) process.exitCode = 1;
