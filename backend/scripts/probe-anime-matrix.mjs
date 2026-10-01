const baseUrl = (process.env.MEDIA_PROBE_BASE_URL ?? 'http://localhost:3000/api/v1').replace(
  /\/+$/,
  '',
);
const concurrency = Math.max(1, Number(process.env.MEDIA_PROBE_CONCURRENCY ?? 2));

const anime = [
  ['Frieren', 154587],
  ['Solo Leveling', 151807],
  ['Solo Leveling S2', 176496],
  ['Vinland Saga', 101348],
  ['Vinland Saga S2', 136430],
  ['Re:Zero', 21355],
  ['Re:Zero S2', 108632],
  ['Re:Zero S2 Part 2', 119661],
  ['Re:Zero S3', 163134],
  ['Attack on Titan', 16498],
  ['Attack on Titan S2', 20958],
  ['Attack on Titan S3', 99147],
  ['Attack on Titan Final', 110277],
  ['Demon Slayer', 101922],
  ['Demon Slayer: Entertainment District', 142329],
  ['Demon Slayer: Swordsmith Village', 145139],
  ['Demon Slayer: Hashira Training', 166240],
  ['Jujutsu Kaisen', 113415],
  ['Jujutsu Kaisen S2', 145064],
  ['Jujutsu Kaisen: Culling Game', 172463],
  ['Naruto', 20],
  ['Naruto Shippuden', 1735],
  ['One Piece', 21],
  ['Death Note', 1535],
  ['Fullmetal Alchemist: Brotherhood', 5114],
  ['Hunter x Hunter', 11061],
  ['Sword Art Online', 11757],
  ['Sword Art Online II', 20594],
  ['Steins;Gate', 9253],
  ['Tokyo Ghoul', 20605],
  ['Tokyo Ghoul Root A', 20850],
  ['One-Punch Man', 21087],
  ['One-Punch Man S2', 97668],
  ['My Hero Academia', 21459],
  ['My Hero Academia S2', 21856],
  ['Haikyu!!', 20464],
  ['Haikyu!! S2', 20992],
  ['Mushoku Tensei', 108465],
  ['Mushoku Tensei Part 2', 127720],
  ['Mushoku Tensei II Part 2', 166873],
  ['Spy x Family', 140960],
  ['Spy x Family Part 2', 142838],
  ['Chainsaw Man', 127230],
  ['Mob Psycho 100', 21507],
  ['Mob Psycho 100 II', 101338],
  ['Kaguya-sama: Love is War', 101921],
  ['Dr. Stone', 105333],
  ['Bleach', 269],
  ['Bleach: Thousand-Year Blood War', 116674],
  ['Made in Abyss', 97986],
  ['Delicious in Dungeon', 153518],
];

const selectedIds = new Set(
  (process.env.MEDIA_PROBE_IDS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map(Number)
    .filter(Number.isInteger),
);
const selectedAnime = selectedIds.size
  ? anime.filter(([, aniListId]) => selectedIds.has(aniListId))
  : anime;

const delay = (durationMs) => new Promise((resolve) => setTimeout(resolve, durationMs));

async function get(path) {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(120_000),
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

async function getCompleteDetails(aniListId) {
  let result;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    result = await get(`/media/${encodeURIComponent(`anilist:${aniListId}`)}`);
    const details = result.details;

    if (details.type === 'anime' && details.animeKind === 'tv' && firstEpisode(details)) {
      return result;
    }

    if (attempt < 3) await delay(attempt * 1_500);
  }

  return result;
}

function firstEpisode(details) {
  return [...(details.episodes ?? [])]
    .filter(
      (episode) =>
        Number.isInteger(episode.episodeNumber) && Number.isInteger(episode.absoluteEpisodeNumber),
    )
    .sort((first, second) => first.absoluteEpisodeNumber - second.absoluteEpisodeNumber)[0];
}

async function probe([label, aniListId], index) {
  const startedAt = performance.now();

  try {
    const result = await getCompleteDetails(aniListId);
    const details = result.details;
    const episode = firstEpisode(details);
    const chain = result.animeSeasonChain ?? [];
    const currentSeason = chain.find((season) => season.mediaRef === details.mediaRef);
    const seasonNumber = currentSeason?.number ?? 1;
    const seasonEpisodeOffset = currentSeason?.seasonEpisodeOffset ?? 0;
    const absoluteEpisodeOffset = currentSeason?.absoluteEpisodeOffset ?? 0;

    if (details.type !== 'anime' || details.animeKind !== 'tv' || !episode) {
      return {
        index: index + 1,
        label,
        aniListId,
        result: 'INVALID_DETAILS',
        actualTitle: details.title,
        type: details.type,
        animeKind: details.animeKind,
        durationMs: Math.round(performance.now() - startedAt),
      };
    }

    const coordinates = {
      seasonNumber,
      episodeNumber: seasonEpisodeOffset + episode.episodeNumber,
      absoluteEpisodeNumber: absoluteEpisodeOffset + episode.episodeNumber,
    };
    const query = new URLSearchParams(
      Object.entries(coordinates).map(([key, value]) => [key, String(value)]),
    );
    const availability = await get(
      `/media/${encodeURIComponent(details.mediaRef)}/availability?${query}`,
    );
    const sources = [
      ...(availability.sources ?? []),
      ...(availability.episodes ?? []).flatMap((item) => item.sources ?? []),
    ];
    const direct = sources.filter((source) => source.kind === 'hls' || source.kind === 'mp4');
    const embeds = sources.filter((source) => source.kind === 'embed');
    const returnedEpisode = (availability.episodes ?? []).find(
      (item) =>
        item.seasonNumber === coordinates.seasonNumber &&
        item.episodeNumber === coordinates.episodeNumber &&
        item.absoluteEpisodeNumber === coordinates.absoluteEpisodeNumber,
    );

    return {
      index: index + 1,
      label,
      aniListId,
      actualTitle: details.title,
      season: coordinates.seasonNumber,
      episode: coordinates.episodeNumber,
      absolute: coordinates.absoluteEpisodeNumber,
      result:
        direct.length > 0 && returnedEpisode
          ? 'DIRECT'
          : direct.length > 0
            ? 'COORDINATE_MISMATCH'
            : 'NO_DIRECT',
      direct: direct.length,
      embeds: embeds.length,
      providers: [...new Set(direct.map((source) => source.provider))].sort(),
      degraded: availability.degraded,
      durationMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    return {
      index: index + 1,
      label,
      aniListId,
      result: 'ERROR',
      error: error instanceof Error ? error.message : 'Unknown error',
      durationMs: Math.round(performance.now() - startedAt),
    };
  }
}

const results = Array(selectedAnime.length);
let nextIndex = 0;

await Promise.all(
  Array.from({ length: concurrency }, async () => {
    while (nextIndex < selectedAnime.length) {
      const index = nextIndex++;
      const result = await probe(selectedAnime[index], index);
      results[index] = result;
      console.log(JSON.stringify(result));
    }
  }),
);

const totals = Object.groupBy(results, (result) => result.result);
console.log(
  JSON.stringify({
    summary: Object.fromEntries(
      Object.entries(totals).map(([result, entries]) => [result, entries.length]),
    ),
    checked: results.length,
  }),
);

if (totals.ERROR?.length || totals.INVALID_DETAILS?.length || totals.COORDINATE_MISMATCH?.length) {
  process.exitCode = 1;
}
