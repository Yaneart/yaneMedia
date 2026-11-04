import { createRequire } from 'node:module';
import { parseArgs } from 'node:util';

const require = createRequire(import.meta.url);
const { ConfigService } = require('@nestjs/config');
const { JacredClient } = require('../dist/torrent/jacred.client');
const { KnabenClient } = require('../dist/torrent/knaben.client');
const { TorrentCatalogsService } = require('../dist/torrent/torrent-catalogs.service');
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
const config = new ConfigService(process.env);
const discovery = new TorrentCatalogsService(new JacredClient(config), new KnabenClient(config));
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
    const catalogs = {};
    for (const release of result.releases)
      sources[release.tracker] = (sources[release.tracker] ?? 0) + 1;
    for (const release of result.releases)
      catalogs[release.catalog] = (catalogs[release.catalog] ?? 0) + 1;
    console.log(
      JSON.stringify({
        round,
        ms: Date.now() - start,
        degraded: result.degraded,
        sources,
        catalogs,
      }),
    );
    if (result.degraded) process.exitCode = 1;
  } catch {
    console.log(JSON.stringify({ round, ms: Date.now() - start, error: 'discovery_unavailable' }));
    process.exitCode = 1;
  }
}
