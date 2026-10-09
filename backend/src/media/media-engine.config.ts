import type { MediaEngine as MediaEngineInstance, StreamingProvider } from '@media-engine/core';
import { createArtworkAwareCache } from './media-engine-cache';
import { countProviderResults } from './media-provider-diagnostics';

export interface MediaEngineEnvironment {
  TMDB_API_KEY?: string;
  MEDIA_ENGINE_SHIKIMORI_USER_AGENT?: string;
  KODIK_API_KEY?: string;
}

const PROVIDER_TIMEOUT_MS = 5_000;
const PRIMARY_METADATA_TIMEOUT_MS = 2_000;
const CINEMETA_TIMEOUT_MS = 15_000;
const STREAMING_PROVIDER_TIMEOUT_MS = 10_000;
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
      ddbbStreamingProvider,
      initemStreamingProvider,
      kinobdProvider,
      kinobdStreamingProvider,
      kodikStreamingProvider,
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

  const cache = createArtworkAwareCache(
    new MemoryCache({
      defaultTtlMs: CACHE_TTL_MS,
      defaultStaleTtlMs: STALE_TTL_MS,
      maxEntries: CACHE_MAX_ENTRIES,
    }),
  );
  const kodikApiKey = readOptionalValue(env.KODIK_API_KEY);
  const streamingProviders: StreamingProvider[] = [
    ...(kodikApiKey ? [kodikStreamingProvider({ apiKey: kodikApiKey })] : []),
    aderomStreamingProvider(),
    initemStreamingProvider(),
    kinobdStreamingProvider({ playerValidationLimit: 0 }),
    ddbbStreamingProvider(),
    aniLibertyStreamingProvider(),
    veoVeoStreamingProvider(),
    videoHubStreamingProvider(),
  ];

  return new MediaEngine({
    debug: true,
    timeoutMs: Math.max(
      CINEMETA_TIMEOUT_MS,
      STREAMING_PROVIDER_TIMEOUT_MS,
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
      'kinobd-streaming': STREAMING_PROVIDER_TIMEOUT_MS,
      'ddbb-streaming': STREAMING_PROVIDER_TIMEOUT_MS,
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
}

function readOptionalValue(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
