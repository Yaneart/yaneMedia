import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { IdentityIds, IdentityNamespace, MediaType } from '@media-engine/core';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service';
import { createMediaSlug } from './media-slug';
import { mediaWorkAliases, mediaWorks } from './media-registry.schema';

export interface CanonicalMediaIdentity {
  mediaRef: string;
  slug: string;
  type: MediaType;
  ids: IdentityIds;
  aliases: string[];
}

export interface RegisterMediaIdentityInput {
  type: MediaType;
  ids: Readonly<Partial<Record<IdentityNamespace, unknown>>>;
  title: string;
  originalTitle?: string;
  year?: number;
}

interface NormalizedAlias {
  namespace: IdentityNamespace;
  value: string;
  alias: string;
}

const IDENTITY_NAMESPACES = [
  'imdb',
  'tmdb',
  'kinopoisk',
  'tvdb',
  'wikidata',
  'shikimori',
  'myAnimeList',
  'aniList',
  'worldArt',
] as const satisfies readonly IdentityNamespace[];
const numericNamespaces = new Set<IdentityNamespace>([
  'tmdb',
  'kinopoisk',
  'tvdb',
  'shikimori',
  'myAnimeList',
  'aniList',
  'worldArt',
]);

function normalizeIdentityId(namespace: IdentityNamespace, input: unknown): string | undefined {
  if (typeof input !== 'string' && typeof input !== 'number') return undefined;
  if (typeof input === 'number' && !Number.isSafeInteger(input)) return undefined;
  const value = String(input).trim();
  if (!value || value.length > 128) return undefined;
  if (namespace === 'imdb') return /^tt\d{7,12}$/i.test(value) ? value.toLowerCase() : undefined;
  if (namespace === 'wikidata') return /^Q[1-9]\d*$/i.test(value) ? value.toUpperCase() : undefined;
  if (!numericNamespaces.has(namespace) || !/^0*[1-9]\d*$/.test(value)) return undefined;
  return BigInt(value).toString();
}

function parseIdentityAlias(alias: string): NormalizedAlias | undefined {
  const separator = alias.indexOf(':');
  const rawNamespace = alias.slice(0, separator);
  const namespace =
    rawNamespace.toLowerCase() === 'anilist'
      ? 'aniList'
      : rawNamespace.toLowerCase() === 'myanimelist'
        ? 'myAnimeList'
        : rawNamespace.toLowerCase() === 'worldart'
          ? 'worldArt'
          : (rawNamespace.toLowerCase() as IdentityNamespace);
  if (separator <= 0 || !IDENTITY_NAMESPACES.includes(namespace)) return undefined;
  const value = normalizeIdentityId(namespace, alias.slice(separator + 1));
  return value ? { namespace, value, alias: `${namespace}:${value}` } : undefined;
}

function normalizeAliases(
  ids: Readonly<Partial<Record<IdentityNamespace, unknown>>>,
): NormalizedAlias[] {
  return IDENTITY_NAMESPACES.flatMap((namespace) => {
    const value = normalizeIdentityId(namespace, ids[namespace]);
    return value ? [{ namespace, value, alias: `${namespace}:${value}` }] : [];
  });
}

function toIdentity(
  work: typeof mediaWorks.$inferSelect,
  aliases: Array<typeof mediaWorkAliases.$inferSelect>,
): CanonicalMediaIdentity {
  const ids: IdentityIds = {};
  for (const alias of aliases) ids[alias.namespace as IdentityNamespace] = alias.value;

  return {
    mediaRef: work.mediaRef,
    slug: work.slug,
    type: work.type,
    ids,
    aliases: aliases.map(({ namespace, value }) => `${namespace}:${value}`).sort(),
  };
}

@Injectable()
export class MediaRegistryService {
  constructor(private readonly databaseService: DatabaseService) {}

  async resolve(locator: string): Promise<CanonicalMediaIdentity | undefined> {
    const parsedAlias = parseIdentityAlias(locator);
    const normalizedAlias = parsedAlias?.alias;
    const work = normalizedAlias
      ? await this.findByAlias(normalizedAlias)
      : await this.findByPublicLocator(locator);

    if (!work) return undefined;
    const canonicalWork = await this.followRedirect(work);
    const aliases = await this.databaseService.db
      .select()
      .from(mediaWorkAliases)
      .where(eq(mediaWorkAliases.mediaRef, canonicalWork.mediaRef));
    return toIdentity(canonicalWork, aliases);
  }

  async resolveOrCreate(input: RegisterMediaIdentityInput): Promise<CanonicalMediaIdentity> {
    return this.upsertIdentity(input, false);
  }

  async resolveOrMergeVerified(input: RegisterMediaIdentityInput): Promise<CanonicalMediaIdentity> {
    return this.upsertIdentity(input, true);
  }

  private async upsertIdentity(
    input: RegisterMediaIdentityInput,
    mergeVerifiedAliases: boolean,
  ): Promise<CanonicalMediaIdentity> {
    const aliases = normalizeAliases(input.ids);
    if (aliases.length === 0) throw new NotFoundException('Media identity is unavailable');

    return this.databaseService.db.transaction(async (transaction) => {
      for (const { alias } of aliases) {
        await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${alias}))`);
      }

      const matchedAliases = await transaction
        .select()
        .from(mediaWorkAliases)
        .where(
          or(
            ...aliases.map(({ namespace, value }) =>
              and(eq(mediaWorkAliases.namespace, namespace), eq(mediaWorkAliases.value, value)),
            ),
          ),
        );
      const matchedRefs = [...new Set(matchedAliases.map(({ mediaRef }) => mediaRef))];
      if (matchedRefs.length > 1 && !mergeVerifiedAliases) {
        throw new ConflictException('Conflicting media aliases');
      }

      const matchedWorks = matchedRefs.length
        ? await transaction
            .select()
            .from(mediaWorks)
            .where(inArray(mediaWorks.mediaRef, matchedRefs))
        : [];
      let work = matchedWorks[0];

      if (matchedWorks.length > 1) {
        const canonicalCandidates = matchedWorks.filter(({ type }) => type === input.type);
        if (canonicalCandidates.length !== 1) {
          throw new ConflictException('Conflicting media aliases');
        }

        const storedAliases = await transaction
          .select()
          .from(mediaWorkAliases)
          .where(inArray(mediaWorkAliases.mediaRef, matchedRefs));
        const valuesByNamespace = new Map<string, Set<string>>();
        for (const alias of storedAliases) {
          const values = valuesByNamespace.get(alias.namespace) ?? new Set<string>();
          values.add(alias.value);
          valuesByNamespace.set(alias.namespace, values);
        }
        if ([...valuesByNamespace.values()].some((values) => values.size > 1)) {
          throw new ConflictException('Conflicting media aliases');
        }

        work = canonicalCandidates[0];
        const redirectedRefs = matchedRefs.filter((mediaRef) => mediaRef !== work!.mediaRef);
        await transaction
          .update(mediaWorkAliases)
          .set({ mediaRef: work.mediaRef })
          .where(inArray(mediaWorkAliases.mediaRef, redirectedRefs));
        await transaction
          .update(mediaWorks)
          .set({ redirectMediaRef: work.mediaRef, updatedAt: new Date() })
          .where(inArray(mediaWorks.mediaRef, redirectedRefs));
      }

      if (work) {
        if (work.type !== input.type && !mergeVerifiedAliases) {
          throw new ConflictException('Conflicting media type');
        }
        const storedAliases = await transaction
          .select()
          .from(mediaWorkAliases)
          .where(eq(mediaWorkAliases.mediaRef, work.mediaRef));
        const storedByNamespace = new Map(
          storedAliases.map(({ namespace, value }) => [namespace, value]),
        );
        if (
          aliases.some(
            ({ namespace, value }) =>
              storedByNamespace.has(namespace) && storedByNamespace.get(namespace) !== value,
          )
        ) {
          throw new ConflictException('Conflicting media aliases');
        }
      } else {
        const mediaRef = `work_${randomUUID()}`;
        const originalSlug = input.originalTitle ? createMediaSlug(input.originalTitle) : 'media';
        const baseSlug = originalSlug === 'media' ? createMediaSlug(input.title) : originalSlug;
        const candidates = [
          baseSlug,
          input.year ? `${baseSlug}-${input.year}` : undefined,
          `${baseSlug}-${input.type}`,
          `${baseSlug}-${mediaRef.slice(-8)}`,
        ].filter((candidate): candidate is string => Boolean(candidate));

        for (const slug of [...new Set(candidates)]) {
          [work] = await transaction
            .insert(mediaWorks)
            .values({ mediaRef, type: input.type, slug })
            .onConflictDoNothing()
            .returning();
          if (work) break;
        }
        if (!work) throw new ConflictException('Could not allocate a media route');
      }

      await transaction
        .insert(mediaWorkAliases)
        .values(
          aliases.map(({ namespace, value }) => ({ namespace, value, mediaRef: work.mediaRef })),
        )
        .onConflictDoNothing();
      const storedAliases = await transaction
        .select()
        .from(mediaWorkAliases)
        .where(eq(mediaWorkAliases.mediaRef, work.mediaRef));

      return toIdentity(work, storedAliases);
    });
  }

  private async followRedirect(work: typeof mediaWorks.$inferSelect) {
    const visited = new Set<string>();
    let current = work;

    while (current.redirectMediaRef) {
      if (visited.has(current.mediaRef)) throw new ConflictException('Cyclic media redirect');
      visited.add(current.mediaRef);
      const [target] = await this.databaseService.db
        .select()
        .from(mediaWorks)
        .where(eq(mediaWorks.mediaRef, current.redirectMediaRef))
        .limit(1);
      if (!target) throw new NotFoundException('Media redirect target is unavailable');
      current = target;
    }

    return current;
  }

  private async findByPublicLocator(locator: string) {
    return (
      await this.databaseService.db
        .select()
        .from(mediaWorks)
        .where(or(eq(mediaWorks.mediaRef, locator), eq(mediaWorks.slug, locator)))
        .limit(1)
    )[0];
  }

  private async findByAlias(alias: string) {
    const parsed = parseIdentityAlias(alias);
    if (!parsed) return undefined;
    return (
      await this.databaseService.db
        .select({
          mediaRef: mediaWorks.mediaRef,
          type: mediaWorks.type,
          slug: mediaWorks.slug,
          redirectMediaRef: mediaWorks.redirectMediaRef,
          createdAt: mediaWorks.createdAt,
          updatedAt: mediaWorks.updatedAt,
        })
        .from(mediaWorkAliases)
        .innerJoin(mediaWorks, eq(mediaWorks.mediaRef, mediaWorkAliases.mediaRef))
        .where(
          and(
            eq(mediaWorkAliases.namespace, parsed.namespace),
            eq(mediaWorkAliases.value, parsed.value),
          ),
        )
        .limit(1)
    )[0];
  }
}
