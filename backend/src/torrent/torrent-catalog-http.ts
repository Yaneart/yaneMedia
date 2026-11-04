import type { DiscoverySearch } from './torrent-discovery.port';

const MAX_BYTES = 2 * 1024 * 1024;

export function catalogSearchTitle(input: DiscoverySearch): string {
  const title = input.title ?? input.query;
  if (
    typeof input.query !== 'string' ||
    input.query.trim().length < 2 ||
    input.query.length > 160 ||
    typeof title !== 'string' ||
    title.trim().length < 2 ||
    title.length > 160 ||
    !Number.isInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > 100 ||
    input.offset !== 0 ||
    !['movie', 'tv', 'anime'].includes(input.kind) ||
    [...input.query, ...title].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    throw new Error('Invalid discovery search');
  return title.trim().normalize('NFKD').replace(/\p{M}/gu, '');
}

export async function fetchCatalogJson(url: URL, signal: AbortSignal): Promise<unknown> {
  signal.throwIfAborted();
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    redirect: 'manual',
    signal: AbortSignal.any([signal, AbortSignal.timeout(4_000)]),
  });
  if (
    !response.ok ||
    !response.headers.get('content-type')?.includes('application/json') ||
    Number(response.headers.get('content-length')) > MAX_BYTES
  ) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error('Catalog unavailable');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Catalog unavailable');
  const parts: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > MAX_BYTES) throw new Error('Catalog response too large');
      parts.push(part.value);
    }
    signal.throwIfAborted();
    return JSON.parse(Buffer.concat(parts).toString('utf8')) as unknown;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
