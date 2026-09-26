import { createHash } from 'node:crypto';
import rawSnapshot from './anibridge-mappings.snapshot.json';
import { resolveMediaRef } from '../media-ref';

const SNAPSHOT_MAPPINGS_SHA256 = '590b72739eaa09200abb60766c287820c99c5f21eb7d421337c08f65658f302b';
const UPSTREAM_ASSET_SHA256 = 'e224de82869f785889a677a1674c6ad5ffc0e4b06cea39ef8156f4b06f8846ee';

interface AniBridgeMapping {
  mediaRef: string;
  imdbIds: string[];
}

interface AniBridgeSnapshot {
  schemaVersion: number;
  source: {
    repository: string;
    release: string;
    asset: string;
    assetUpdatedAt: string;
    assetSha256: string;
  };
  mappings: AniBridgeMapping[];
}

export interface EditorialIdentityOverride {
  mediaRefs: readonly string[];
  provenance: string;
}

export interface ResolvedIdentityRef {
  mediaRef: string;
  provenance: string;
}

export interface AnimeIdentityMappingResult {
  identities: ResolvedIdentityRef[];
  rejectedProviders: string[];
}

export const anibridgeProvenance = `anibridge:v3:sha256:${UPSTREAM_ASSET_SHA256}`;

export function resolveAnimeIdentityMappings(
  mediaRefs: readonly string[],
  override?: EditorialIdentityOverride,
  snapshot: unknown = rawSnapshot,
  expectedMappingsSha256 = SNAPSHOT_MAPPINGS_SHA256,
): AnimeIdentityMappingResult {
  const parsed = parseSnapshot(snapshot, expectedMappingsSha256);
  const imdbIdsByRef = new Map(parsed.mappings.map(({ mediaRef, imdbIds }) => [mediaRef, imdbIds]));
  const candidates = new Map<string, Set<string>>();

  for (const mediaRef of mediaRefs) {
    for (const imdbId of imdbIdsByRef.get(mediaRef) ?? []) {
      const refs = candidates.get('imdb') ?? new Set<string>();
      refs.add(`imdb:${imdbId}`);
      candidates.set('imdb', refs);
    }
  }

  const rejectedProviders: string[] = [];
  const resolved = new Map<string, ResolvedIdentityRef>();
  for (const [provider, refs] of candidates) {
    if (refs.size !== 1) {
      rejectedProviders.push(provider);
      continue;
    }
    resolved.set(provider, { mediaRef: [...refs][0], provenance: anibridgeProvenance });
  }

  for (const mediaRef of override?.mediaRefs ?? []) {
    resolved.set(providerOf(mediaRef), { mediaRef, provenance: override!.provenance });
  }

  for (const mediaRef of mediaRefs) resolved.delete(providerOf(mediaRef));

  return {
    identities: [...resolved.values()],
    rejectedProviders: rejectedProviders.filter((provider) => !resolved.has(provider)).sort(),
  };
}

function parseSnapshot(value: unknown, expectedMappingsSha256: string): AniBridgeSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    invalidSnapshot('expected object');
  const snapshot = value as AniBridgeSnapshot;
  if (snapshot.schemaVersion !== 1) invalidSnapshot('unsupported schema version');
  if (
    !snapshot.source ||
    snapshot.source.repository !== 'anibridge/anibridge-mappings' ||
    snapshot.source.release !== 'v3' ||
    snapshot.source.asset !== 'mappings.min.json' ||
    snapshot.source.assetSha256 !== UPSTREAM_ASSET_SHA256
  ) {
    invalidSnapshot('unexpected source');
  }
  if (!Array.isArray(snapshot.mappings)) invalidSnapshot('mappings must be an array');

  const digest = createHash('sha256').update(JSON.stringify(snapshot.mappings)).digest('hex');
  if (digest !== expectedMappingsSha256) invalidSnapshot('mapping checksum mismatch');

  const seen = new Set<string>();
  for (const [index, mapping] of snapshot.mappings.entries()) {
    if (!mapping || typeof mapping !== 'object') invalidSnapshot(`invalid mapping at ${index}`);
    if (!/^(?:anilist|myanimelist):\d{1,12}$/.test(mapping.mediaRef)) {
      invalidSnapshot(`invalid media reference at ${index}`);
    }
    if (seen.has(mapping.mediaRef)) invalidSnapshot(`duplicate mapping for ${mapping.mediaRef}`);
    seen.add(mapping.mediaRef);
    if (
      !Array.isArray(mapping.imdbIds) ||
      mapping.imdbIds.length === 0 ||
      mapping.imdbIds.some((id) => !/^tt\d{7,12}$/.test(id))
    ) {
      invalidSnapshot(`invalid IMDb identifiers at ${index}`);
    }
  }
  return snapshot;
}

function providerOf(mediaRef: string): string {
  const resolved = resolveMediaRef(mediaRef);
  if (!resolved) throw new Error(`Invalid media identity override: ${mediaRef}`);
  return Object.keys(resolved)[0];
}

function invalidSnapshot(message: string): never {
  throw new Error(`Invalid AniBridge mapping snapshot: ${message}`);
}
