import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';

const require = createRequire(import.meta.url);
const { ConfigService } = require('@nestjs/config');
const { createProwlarrConfig } = require('../dist/torrent/prowlarr.config');
const { ProwlarrClient } = require('../dist/torrent/prowlarr.client');
const { JacredClient } = require('../dist/torrent/jacred.client');
const { TorrentDiscoveryClient } = require('../dist/torrent/torrent-discovery.client');
const { values } = parseArgs({
  options: {
    query: { type: 'string' },
    kind: { type: 'string', default: 'movie' },
    rounds: { type: 'string', default: '2' },
  },
});
const rounds = Number(values.rounds);
if (
  !values.query ||
  !['movie', 'tv', 'anime'].includes(values.kind) ||
  !Number.isInteger(rounds) ||
  rounds < 1 ||
  rounds > 3
) {
  throw new Error('Usage: --query TITLE [--kind movie|tv|anime] [--rounds 1|2|3]');
}
const config = new ConfigService({
  ...process.env,
  PROWLARR_TIMEOUT_MS: Number(process.env.PROWLARR_TIMEOUT_MS ?? 10000),
});
const discovery = new TorrentDiscoveryClient(
  new ProwlarrClient(createProwlarrConfig(config)),
  new JacredClient(config),
);
for (let round = 1; round <= rounds; round++) {
  const start = Date.now();
  try {
    const result = await discovery.search(
      {
        query: values.query,
        title: values.query,
        kind: values.kind,
        limit: 50,
        offset: 0,
      },
      AbortSignal.timeout(25000),
    );
    const sources = {};
    for (const release of result.releases)
      sources[release.tracker] = (sources[release.tracker] ?? 0) + 1;
    console.log(
      JSON.stringify({ round, ms: Date.now() - start, degraded: result.degraded, sources }),
    );
    if (result.degraded) process.exitCode = 1;
  } catch {
    console.log(JSON.stringify({ round, ms: Date.now() - start, error: 'discovery_unavailable' }));
    process.exitCode = 1;
  }
}
