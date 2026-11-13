import type { MediaEngine as MediaEngineInstance, StreamingProvider } from '@media-engine/core';
import { createMediaEngineCache } from './media-engine-cache';
import { countProviderResults } from './media-provider-diagnostics';
import { withAnimeStreamingTitles } from './anime-streaming-titles';
import { withAnimeStreamingReleases } from './anime-streaming-releases';

export interface MediaEngineEnvironment {
  TMDB_API_KEY?: string;
  MEDIA_ENGINE_SHIKIMORI_USER_AGENT?: string;
  KODIK_API_KEY?: string;
  VEOVEO_API_KEY?: string;
  FILMIX_API_KEY?: string;
  FILMIX_API_BASE_URL?: string;
  VIBIX_API_KEY?: string;
  COLLAPS_API_KEY?: string;
  ALOHA_API_KEY?: string;
  VIDEOSEED_API_KEY?: string;
  VIDEOSEED_PLAYER_TOKEN?: string;
  MIRAGE_API_KEY?: string;
  HDVB_API_KEY?: string;
}

const PROVIDER_TIMEOUT_MS = 5_000;
const PRIMARY_METADATA_TIMEOUT_MS = 2_000;
const CINEMETA_TIMEOUT_MS = 15_000;
const STREAMING_PROVIDER_TIMEOUT_MS = 10_000;
const RUTUBE_STREAMING_PROVIDER_TIMEOUT_MS = 20_000;
const VIDEOHUB_STREAMING_PROVIDER_TIMEOUT_MS = 20_000;
const IDENTITY_TIMEOUT_MS = 10_000;
const IDENTITY_SOURCE_TIMEOUT_MS = 5_000;
const CACHE_TTL_MS = 5 * 60_000;
const STALE_TTL_MS = 30 * 60_000;
const CACHE_MAX_ENTRIES = 500;
const CIRCUIT_RECOVERY_TIMEOUT_MS = 10_000;

export async function createMediaEngine(
  env: MediaEngineEnvironment = {},
): Promise<MediaEngineInstance> {
  const [
    { IdentityResolver, MediaEngine, MemoryCache },
    {
      aderomIdentitySource,
      aderomStreamingProvider,
      aniLibertyStreamingProvider,
      aniListIdentitySource,
      aniListProvider,
      cinemetaProvider,
      vibixStreamingProvider,
      collapsStreamingProvider,
      allohaStreamingProvider,
      videoSeedStreamingProvider,
      mirageStreamingProvider,
      hdvbStreamingProvider,
      filmixStreamingProvider,
      initemStreamingProvider,
      kinobdProvider,
      kinobdStreamingProvider,
      kodikStreamingProvider,
      rutubeStreamingProvider,
      shikimoriGraphqlProvider,
      shikimoriProvider,
      shikimoriCinemaIdentitySource,
      shikimoriIdentitySource,
      tmdbOfficialProvider,
      tmdbProvider,
      tvMazeProvider,
      veoVeoStreamingProvider,
      videoHubStreamingProvider,
      wikidataIdentitySource,
      wikidataProvider,
    },
  ] = await Promise.all([import('@media-engine/core'), import('@media-engine/providers')]);

  const cache = createMediaEngineCache(
    new MemoryCache({
      defaultTtlMs: CACHE_TTL_MS,
      defaultStaleTtlMs: STALE_TTL_MS,
      maxEntries: CACHE_MAX_ENTRIES,
    }),
  );
  const kodikApiKey = readOptionalValue(env.KODIK_API_KEY);
  const veoVeoApiKey = readOptionalValue(env.VEOVEO_API_KEY);
  const filmixToken = readOptionalValue(env.FILMIX_API_KEY);
  const keyedStreamingProviders: StreamingProvider[] = (
    [
      [env.VIBIX_API_KEY, vibixStreamingProvider, {}],
      [env.COLLAPS_API_KEY, collapsStreamingProvider, {}],
      // The operator explicitly approves these public tokens in their iframe URLs.
      [env.ALOHA_API_KEY, allohaStreamingProvider, { allowApiKeyInEmbedUrl: true }],
      [env.MIRAGE_API_KEY, mirageStreamingProvider, { allowApiKeyInEmbedUrl: true }],
      [
        env.VIDEOSEED_API_KEY,
        videoSeedStreamingProvider,
        { playerToken: readOptionalValue(env.VIDEOSEED_PLAYER_TOKEN) },
      ],
      [env.HDVB_API_KEY, hdvbStreamingProvider, {}],
    ] as const
  ).flatMap(([value, factory, options]) => {
    const apiKey = readOptionalValue(value);
    if (!apiKey) return [];
    const provider = factory({ ...options, apiKey });
    return [
      provider.capabilities.lookup.byEpisode ? withAnimeStreamingReleases(provider) : provider,
    ];
  });
  const streamingProviders: StreamingProvider[] = [
    ...(kodikApiKey ? [kodikStreamingProvider({ apiKey: kodikApiKey })] : []),
    ...(filmixToken
      ? [
          filmixStreamingProvider({
            token: filmixToken,
            baseUrl: readOptionalValue(env.FILMIX_API_BASE_URL) ?? 'http://filmixapp.cyou/api/v2',
            // The operator explicitly permits HTTP token authentication for Filmix in this app.
            allowInsecureHttpToken: true,
          }),
        ]
      : []),
    ...keyedStreamingProviders,
    rutubeStreamingProvider(),
    aderomStreamingProvider(),
    initemStreamingProvider(),
    kinobdStreamingProvider({ playerValidationLimit: 0 }),
    withAnimeStreamingTitles(aniLibertyStreamingProvider(), (ids, signal) =>
      engine.getDetails({ ids, type: 'anime', language: 'ru' }, { signal }),
    ),
    ...(veoVeoApiKey
      ? [withAnimeStreamingReleases(veoVeoStreamingProvider({ apiKey: veoVeoApiKey }))]
      : []),
    withAnimeStreamingReleases(videoHubStreamingProvider()),
  ];

  const engine = new MediaEngine({
    debug: true,
    timeoutMs: Math.max(
      CINEMETA_TIMEOUT_MS,
      STREAMING_PROVIDER_TIMEOUT_MS,
      RUTUBE_STREAMING_PROVIDER_TIMEOUT_MS,
      VIDEOHUB_STREAMING_PROVIDER_TIMEOUT_MS,
    ),
    circuitBreaker: { recoveryTimeoutMs: CIRCUIT_RECOVERY_TIMEOUT_MS },
    providerTimeouts: {
      'tmdb-official': PRIMARY_METADATA_TIMEOUT_MS,
      'shikimori-graphql': PRIMARY_METADATA_TIMEOUT_MS,
      tmdb: Math.min(PROVIDER_TIMEOUT_MS, 1_500),
      kinobd: Math.min(PROVIDER_TIMEOUT_MS, 1_000),
      cinemeta: CINEMETA_TIMEOUT_MS,
      shikimori: PROVIDER_TIMEOUT_MS,
      anilist: PROVIDER_TIMEOUT_MS,
      tvmaze: PROVIDER_TIMEOUT_MS,
      wikidata: PROVIDER_TIMEOUT_MS,
      'kodik-streaming': STREAMING_PROVIDER_TIMEOUT_MS,
      'filmix-streaming': STREAMING_PROVIDER_TIMEOUT_MS,
      'rutube-streaming': RUTUBE_STREAMING_PROVIDER_TIMEOUT_MS,
      'kinobd-streaming': STREAMING_PROVIDER_TIMEOUT_MS,
      'vibix-streaming': STREAMING_PROVIDER_TIMEOUT_MS,
      'collaps-streaming': STREAMING_PROVIDER_TIMEOUT_MS,
      'alloha-streaming': STREAMING_PROVIDER_TIMEOUT_MS,
      'mirage-streaming': STREAMING_PROVIDER_TIMEOUT_MS,
      'videoseed-streaming': STREAMING_PROVIDER_TIMEOUT_MS,
      'hdvb-streaming': STREAMING_PROVIDER_TIMEOUT_MS,
      'aniliberty-streaming': STREAMING_PROVIDER_TIMEOUT_MS,
      'veoveo-streaming': STREAMING_PROVIDER_TIMEOUT_MS,
      'videohub-streaming': VIDEOHUB_STREAMING_PROVIDER_TIMEOUT_MS,
      'aderom-streaming': STREAMING_PROVIDER_TIMEOUT_MS,
      'initem-streaming': STREAMING_PROVIDER_TIMEOUT_MS,
    },
    cache,
    identityResolver: new IdentityResolver(
      [
        wikidataIdentitySource(),
        aniListIdentitySource(),
        shikimoriIdentitySource(),
        shikimoriCinemaIdentitySource(),
        aderomIdentitySource(),
      ],
      {
        cache,
        timeoutMs: IDENTITY_TIMEOUT_MS,
        sourceTimeoutMs: IDENTITY_SOURCE_TIMEOUT_MS,
      },
    ),
    providers: [
      tmdbOfficialProvider({ apiKey: readOptionalValue(env.TMDB_API_KEY) }),
      shikimoriGraphqlProvider({
        userAgent: readOptionalValue(env.MEDIA_ENGINE_SHIKIMORI_USER_AGENT),
      }),
      tmdbProvider(),
      kinobdProvider(),
      cinemetaProvider(),
      shikimoriProvider(),
      aniListProvider(),
      tvMazeProvider(),
      wikidataProvider(),
    ].map(countProviderResults),
    streamingProviders,
  });
  return engine;
}

function readOptionalValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
