import rawManifest from './editorial-catalog.manifest.json';
import {
  createMediaRef,
  resolveMediaRef,
  resolveMediaRefs,
  type MediaExternalIds,
  type MediaRefType,
} from '../media-ref';

export const editorialCollectionIds = ['featured', 'editorial-picks'] as const;
export type EditorialCollectionId = (typeof editorialCollectionIds)[number];

export interface EditorialCatalogEntry {
  mediaRef: string;
  type: MediaRefType;
  catalogOrder: number;
  collections: readonly EditorialCollectionId[];
}

export interface MediaCatalogCollectionDefinition {
  id: string;
  title: string;
  mediaRefs: readonly string[];
}

export interface HomeCollectionManifest extends MediaCatalogCollectionDefinition {
  fullCollectionId?: EditorialCollectionId;
}

export interface EditorialCatalogManifest {
  version: number;
  source: string;
  identities: Readonly<Record<string, EditorialMediaIdentity>>;
  featuredMediaRefs: readonly string[];
  artworkOverrides: Readonly<Record<string, { posterUrl?: string; backdropUrl?: string }>>;
  catalogs: Record<MediaRefType, readonly MediaCatalogCollectionDefinition[]>;
  homeCollections: readonly HomeCollectionManifest[];
}

export interface EditorialMediaIdentity {
  mediaRefs: readonly string[];
  externalIds: MediaExternalIds;
  provenance: string;
}

const mediaTypes = ['movie', 'series', 'anime'] as const;
const stableIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function fail(path: string, message: string): never {
  throw new Error(`Invalid editorial catalog manifest at ${path}: ${message}`);
}

function readRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'expected an object');
  return value as Record<string, unknown>;
}

function readString(value: unknown, path: string, maximumLength: number): string {
  if (typeof value !== 'string' || value.trim() !== value || value.length === 0) {
    fail(path, 'expected a non-blank trimmed string');
  }
  if (value.length > maximumLength) fail(path, `must not exceed ${maximumLength} characters`);
  return value;
}

function readStableId(value: unknown, path: string): string {
  const id = readString(value, path, 100);
  if (!stableIdPattern.test(id)) fail(path, 'expected a lowercase kebab-case identifier');
  return id;
}

function readArtworkUrl(value: unknown, path: string): string {
  const url = readString(value, path, 2_048);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    fail(path, 'expected an absolute URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    fail(path, 'expected an HTTP(S) URL');
  }
  return url;
}

function readMediaRefs(value: unknown, path: string, knownRefs?: Set<string>): string[] {
  if (!Array.isArray(value) || value.length === 0) fail(path, 'expected a non-empty array');
  const refs = value.map((candidate, index) => readString(candidate, `${path}[${index}]`, 64));

  if (new Set(refs).size !== refs.length) fail(path, 'contains duplicate media references');
  for (const mediaRef of refs) {
    if (!resolveMediaRef(mediaRef)) fail(path, `contains invalid media reference ${mediaRef}`);
    if (knownRefs && !knownRefs.has(mediaRef))
      fail(path, `contains unknown media reference ${mediaRef}`);
  }
  return refs;
}

function readCollection(
  value: unknown,
  path: string,
  knownRefs?: Set<string>,
): MediaCatalogCollectionDefinition {
  const record = readRecord(value, path);
  return {
    id: readStableId(record.id, `${path}.id`),
    title: readString(record.title, `${path}.title`, 200),
    mediaRefs: readMediaRefs(record.mediaRefs, `${path}.mediaRefs`, knownRefs),
  };
}

export function parseEditorialCatalogManifest(value: unknown): EditorialCatalogManifest {
  const root = readRecord(value, '$');
  if (!Number.isInteger(root.version) || (root.version as number) < 1) {
    fail('$.version', 'expected a positive integer');
  }
  const source = readString(root.source, '$.source', 80);
  const rawCatalogs = readRecord(root.catalogs, '$.catalogs');
  const knownRefs = new Set<string>();
  const catalogs = {} as Record<MediaRefType, MediaCatalogCollectionDefinition[]>;

  for (const type of mediaTypes) {
    const rawCollections = rawCatalogs[type];
    if (!Array.isArray(rawCollections) || rawCollections.length === 0) {
      fail(`$.catalogs.${type}`, 'expected a non-empty array');
    }
    const collections = rawCollections.map((collection, index) =>
      readCollection(collection, `$.catalogs.${type}[${index}]`),
    );
    if (new Set(collections.map(({ id }) => id)).size !== collections.length) {
      fail(`$.catalogs.${type}`, 'contains duplicate collection identifiers');
    }

    for (const collection of collections) {
      for (const mediaRef of collection.mediaRefs) {
        if (knownRefs.has(mediaRef)) fail(`$.catalogs.${type}`, `repeats ${mediaRef}`);
        const canonical = createMediaRef(resolveMediaRef(mediaRef) ?? {}, type);
        if (canonical !== mediaRef) fail(`$.catalogs.${type}`, `${mediaRef} is not canonical`);
        knownRefs.add(mediaRef);
      }
    }
    catalogs[type] = collections;
  }

  const rawIdentities = readRecord(root.identities ?? {}, '$.identities');
  const claimedAliases = new Map<string, string>();
  const identities = Object.fromEntries(
    [...knownRefs].map((mediaRef) => {
      const path = `$.identities.${mediaRef}`;
      const rawIdentity = rawIdentities[mediaRef];
      const record = rawIdentity === undefined ? undefined : readRecord(rawIdentity, path);
      const mediaRefs = record ? readMediaRefs(record.mediaRefs, `${path}.mediaRefs`) : [mediaRef];
      if (!mediaRefs.includes(mediaRef)) fail(path, `must include canonical reference ${mediaRef}`);
      const externalIds = resolveMediaRefs(mediaRefs);
      if (!externalIds) fail(path, 'contains conflicting external identifiers');

      for (const alias of mediaRefs) {
        const owner = claimedAliases.get(alias);
        if (owner && owner !== mediaRef) fail(path, `${alias} is already assigned to ${owner}`);
        claimedAliases.set(alias, mediaRef);
      }

      return [
        mediaRef,
        {
          mediaRefs,
          externalIds,
          provenance: record ? readString(record.provenance, `${path}.provenance`, 200) : source,
        },
      ];
    }),
  );
  for (const mediaRef of Object.keys(rawIdentities)) {
    if (!knownRefs.has(mediaRef))
      fail('$.identities', `contains unknown media reference ${mediaRef}`);
  }

  const featuredMediaRefs = readMediaRefs(root.featuredMediaRefs, '$.featuredMediaRefs', knownRefs);
  const rawArtworkOverrides = readRecord(root.artworkOverrides ?? {}, '$.artworkOverrides');
  const artworkOverrides = Object.fromEntries(
    Object.entries(rawArtworkOverrides).map(([mediaRef, value]) => {
      if (!knownRefs.has(mediaRef)) {
        fail('$.artworkOverrides', `contains unknown media reference ${mediaRef}`);
      }
      const path = `$.artworkOverrides.${mediaRef}`;
      const record = readRecord(value, path);
      const posterUrl =
        record.posterUrl === undefined
          ? undefined
          : readArtworkUrl(record.posterUrl, `${path}.posterUrl`);
      const backdropUrl =
        record.backdropUrl === undefined
          ? undefined
          : readArtworkUrl(record.backdropUrl, `${path}.backdropUrl`);
      if (!posterUrl && !backdropUrl) fail(path, 'expected at least one artwork URL');
      return [mediaRef, { posterUrl, backdropUrl }];
    }),
  );
  const rawHomeCollections = root.homeCollections;
  if (!Array.isArray(rawHomeCollections) || rawHomeCollections.length === 0) {
    fail('$.homeCollections', 'expected a non-empty array');
  }
  const homeCollections = rawHomeCollections.map((value, index): HomeCollectionManifest => {
    const path = `$.homeCollections[${index}]`;
    const record = readRecord(value, path);
    const collection = readCollection(record, path, knownRefs);
    const fullCollectionId = record.fullCollectionId;

    if (
      fullCollectionId !== undefined &&
      !editorialCollectionIds.includes(fullCollectionId as EditorialCollectionId)
    ) {
      fail(`${path}.fullCollectionId`, 'is not a supported aggregate collection');
    }
    return {
      ...collection,
      ...(fullCollectionId === undefined
        ? {}
        : { fullCollectionId: fullCollectionId as EditorialCollectionId }),
    };
  });
  if (new Set(homeCollections.map(({ id }) => id)).size !== homeCollections.length) {
    fail('$.homeCollections', 'contains duplicate collection identifiers');
  }

  return {
    version: root.version as number,
    source,
    identities,
    featuredMediaRefs,
    artworkOverrides,
    catalogs,
    homeCollections,
  };
}

export const editorialManifest = parseEditorialCatalogManifest(rawManifest);
export const mediaCatalogCollectionDefinitions = editorialManifest.catalogs;

const featuredMediaRefs = new Set(editorialManifest.featuredMediaRefs);
const featuredCollections = ['featured', 'editorial-picks'] as const;
const editorialCollections = ['editorial-picks'] as const;
const entriesByType = Object.fromEntries(
  mediaTypes.map((type) => [
    type,
    mediaCatalogCollectionDefinitions[type]
      .flatMap((collection) => collection.mediaRefs)
      .map((mediaRef, index): EditorialCatalogEntry => ({
        mediaRef,
        type,
        catalogOrder: index + 1,
        collections: featuredMediaRefs.has(mediaRef) ? featuredCollections : editorialCollections,
      })),
  ]),
) as Record<MediaRefType, EditorialCatalogEntry[]>;

export const editorialCatalog: readonly EditorialCatalogEntry[] = Array.from(
  { length: Math.max(...mediaTypes.map((type) => entriesByType[type].length)) },
  (_, index) => mediaTypes.flatMap((type) => entriesByType[type][index] ?? []),
).flat();
