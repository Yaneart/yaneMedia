const baseUrl = (process.env.MEDIA_PROBE_BASE_URL ?? 'http://localhost:3000/api/v1').replace(
  /\/+$/,
  '',
);
const probes = [
  ['shogun-details', 'imdb:tt2788316', ''],
  ['spirited-away-availability', 'anilist:199', '/availability'],
  ['frieren-availability', 'anilist:154587', '/availability'],
  ['attack-on-titan-availability', 'anilist:16498', '/availability'],
  ['naruto-availability', 'anilist:20', '/availability'],
  ['movie-availability', 'imdb:tt1160419', '/availability'],
  ['series-availability', 'imdb:tt5753856', '/availability'],
];

let failed = false;
for (const [name, mediaRef, suffix] of probes) {
  const startedAt = performance.now();
  try {
    const response = await fetch(`${baseUrl}/media/${encodeURIComponent(mediaRef)}${suffix}`, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(50_000),
    });
    const body = await response.json();
    const data = body.data ?? body;
    const availability = suffix ? data : null;
    const sources = availability
      ? [
          ...(availability.sources ?? []),
          ...(availability.episodes ?? []).flatMap((episode) => episode.sources ?? []),
        ]
      : [];
    const sourceCount = availability ? sources.length : undefined;
    const sourceKinds = availability
      ? [...new Set(sources.map((source) => source.kind))].sort()
      : undefined;
    console.log(
      JSON.stringify({
        name,
        status: response.status,
        durationMs: Math.round(performance.now() - startedAt),
        degraded: data.degraded,
        sourceCount,
        sourceKinds,
      }),
    );
    failed ||= !response.ok;
  } catch (error) {
    failed = true;
    console.log(
      JSON.stringify({
        name,
        status: 'ERROR',
        durationMs: Math.round(performance.now() - startedAt),
        error: error instanceof Error ? error.name : 'UnknownError',
      }),
    );
  }
}
if (failed) process.exitCode = 1;
