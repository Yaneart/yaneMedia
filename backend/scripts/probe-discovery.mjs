import { performance } from 'node:perf_hooks';

const DEFAULT_BASE_URL = 'http://localhost:3000/api/v1';
const REQUEST_TIMEOUT_MS = 90_000;

const probes = [
  ['home-featured', '/media/home/featured'],
  ['home-collections-first', '/media/home/collections?offset=0&limit=2'],
  ['catalog-movie', '/media/catalog?type=movie'],
  ['catalog-series', '/media/catalog?type=series'],
  ['catalog-anime', '/media/catalog?type=anime'],
  [
    'filtered-movie-discovery',
    '/media/search?type=movie&genre=Drama&year=2024&minimumRating=7&offset=0&limit=49',
  ],
];

function normalizedBaseUrl(value) {
  return value.replace(/\/+$/, '');
}

async function runProbe(baseUrl, [name, path]) {
  const startedAt = performance.now();

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const headersAt = performance.now();
    const body = await response.arrayBuffer();

    return {
      name,
      status: response.status,
      ttfbMs: Math.round(headersAt - startedAt),
      totalMs: Math.round(performance.now() - startedAt),
      responseBytes: body.byteLength,
    };
  } catch (error) {
    return {
      name,
      status: 'ERROR',
      ttfbMs: null,
      totalMs: Math.round(performance.now() - startedAt),
      responseBytes: 0,
      error: error instanceof Error ? error.name : 'UnknownError',
    };
  }
}

const baseUrl = normalizedBaseUrl(process.env.DISCOVERY_PROBE_BASE_URL ?? DEFAULT_BASE_URL);
let failed = false;

for (const probe of probes) {
  const result = await runProbe(baseUrl, probe);
  failed ||= result.status === 'ERROR' || result.status >= 400;
  console.log(JSON.stringify(result));
}

if (failed) {
  process.exitCode = 1;
}
