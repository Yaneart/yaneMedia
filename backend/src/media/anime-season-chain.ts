import type {
  ExternalIds,
  MediaDetails,
  MediaRelation,
  RelatedMediaItem,
  RelatedMediaResponse,
} from '@media-engine/core';
import { createMediaRef } from './media-ref';
import { groupAnimeReleases } from './anime-release-grouping';
import { isAnimeSeasonKind } from './anime-season-kind';

export const MAX_ANIME_SEASON_CHAIN_LENGTH = 12;

export interface AnimeSeasonChainEntry {
  number: number;
  releaseIndex: number;
  mediaRef: string;
  slug?: string;
  title: string;
  year?: number;
  episodesCount: number;
  seasonEpisodeOffset: number;
  absoluteEpisodeOffset: number;
  canonicalMappingVerified: boolean;
  ids?: ExternalIds;
}

interface AnimeSeasonNode extends AnimeSeasonChainEntry {
  ids: ExternalIds;
  identityRef: string;
  titles: string[];
  declaredSeason?: number;
}

type LoadRelatedMedia = (ids: ExternalIds) => Promise<RelatedMediaResponse>;
type LoadReleaseDetails = (ids: ExternalIds) => Promise<MediaDetails | null>;

function releaseTitles(item: RelatedMediaItem): string[] {
  return [...new Set([item.title, item.originalTitle, ...(item.alternativeTitles ?? [])])].filter(
    (title): title is string => Boolean(title?.trim()),
  );
}

function declaredSeason(item: RelatedMediaItem): number | undefined {
  for (const title of [item.originalTitle, item.title]) {
    const match = /\b(?:season\s*([1-9]\d?)|([1-9]\d?)(?:st|nd|rd|th)?\s*season)\b/iu.exec(
      title ?? '',
    );
    if (match) return Number(match[1] ?? match[2]);
  }
  return undefined;
}

function createAnimeIdentityRef(ids: ExternalIds): string | undefined {
  const myAnimeList = ids.myAnimeList?.trim() || ids.shikimori?.trim();

  if (myAnimeList && /^\d{1,12}$/.test(myAnimeList)) {
    return `myanimelist:${myAnimeList}`;
  }

  return createMediaRef(ids, 'anime');
}

function isPlayableSeasonAnime(item: RelatedMediaItem, bridge = false): boolean {
  const isReleased =
    item.status === 'released' || item.status === 'ended' || item.status === 'ongoing';

  return (
    item.type === 'anime' &&
    (bridge ? !isAnimeSeasonKind(item.animeKind) : isAnimeSeasonKind(item.animeKind)) &&
    isReleased &&
    (item.episodesCount ?? 0) > 0
  );
}

function toRelatedNode(relation: MediaRelation, bridge: boolean): AnimeSeasonNode | undefined {
  if (!isPlayableSeasonAnime(relation.item, bridge) || !relation.item.ids) return undefined;

  const mediaRef = createMediaRef(relation.item.ids, 'anime');
  const identityRef = createAnimeIdentityRef(relation.item.ids);

  if (!mediaRef || !identityRef) return undefined;

  return {
    number: 0,
    releaseIndex: 0,
    mediaRef,
    identityRef,
    ids: relation.item.ids,
    title: relation.item.title,
    titles: releaseTitles(relation.item),
    declaredSeason: declaredSeason(relation.item),
    year: relation.item.year,
    episodesCount: relation.item.episodesCount!,
    seasonEpisodeOffset: 0,
    absoluteEpisodeOffset: 0,
    canonicalMappingVerified: false,
  };
}

function selectRelation(
  relations: readonly MediaRelation[],
  kind: 'prequel' | 'sequel',
  bridge = false,
): { candidate?: AnimeSeasonNode; ambiguous: boolean } {
  const candidates = new Map<string, AnimeSeasonNode>();

  for (const relation of relations) {
    if (relation.kind !== kind) continue;

    const candidate = toRelatedNode(relation, bridge);

    if (!candidate) continue;

    const existing = candidates.get(candidate.identityRef);

    if (!existing) {
      candidates.set(candidate.identityRef, candidate);
      continue;
    }

    const ids = { ...candidate.ids, ...existing.ids };
    candidates.set(candidate.identityRef, {
      ...candidate,
      ...existing,
      ids,
      titles: [...new Set([...existing.titles, ...candidate.titles])],
      mediaRef: createMediaRef(ids, 'anime') ?? existing.mediaRef,
    });
  }

  return {
    candidate: candidates.size === 1 ? [...candidates.values()][0] : undefined,
    ambiguous: candidates.size > 1,
  };
}

function toInitialNode(mediaRef: string, details: MediaDetails): AnimeSeasonNode | undefined {
  if (
    details.type !== 'anime' ||
    details.animeKind === 'movie' ||
    (details.status !== 'released' && details.status !== 'ended' && details.status !== 'ongoing') ||
    !details.ids
  ) {
    return undefined;
  }

  const episodesCount = details.episodesCount ?? details.episodes?.length ?? 0;

  if (episodesCount <= 0) return undefined;

  return {
    number: 0,
    releaseIndex: 0,
    mediaRef,
    identityRef: createAnimeIdentityRef(details.ids) ?? mediaRef,
    ids: details.ids,
    title: details.title,
    titles: releaseTitles(details),
    declaredSeason: declaredSeason(details),
    year: details.year,
    episodesCount,
    seasonEpisodeOffset: 0,
    absoluteEpisodeOffset: 0,
    canonicalMappingVerified: false,
  };
}

function getCanonicalSeasonEpisodeCounts(details: MediaDetails): number[] | undefined {
  if (details.type !== 'anime' || !details.canonicalSeasons?.length) return undefined;

  const seasons = details.canonicalSeasons
    .filter(({ number }) => number > 0)
    .sort((first, second) => first.number - second.number);

  if (!seasons.every((season, index) => season.number === index + 1)) return undefined;

  const counts = seasons.map((season) => season.episodesCount ?? season.episodes?.length ?? 0);
  return counts.every((count) => Number.isSafeInteger(count) && count > 0) ? counts : undefined;
}

export async function buildAnimeSeasonChain(
  mediaRef: string,
  details: MediaDetails,
  loadRelatedMedia: LoadRelatedMedia,
  loadReleaseDetails?: LoadReleaseDetails,
): Promise<AnimeSeasonChainEntry[]> {
  const initialNode = toInitialNode(mediaRef, details);

  if (!initialNode || details.type !== 'anime') return [];

  // Other release formats keep their own episode catalog when opened directly.
  // They can connect story links without adding a season to a TV/ONA chain.
  if (!isAnimeSeasonKind(details.animeKind)) {
    return [
      {
        number: 1,
        releaseIndex: 0,
        mediaRef,
        title: initialNode.title,
        year: initialNode.year,
        episodesCount: initialNode.episodesCount,
        seasonEpisodeOffset: 0,
        absoluteEpisodeOffset: 0,
        canonicalMappingVerified: false,
        ids: initialNode.ids,
      },
    ];
  }

  const responseCache = new Map<string, Promise<RelatedMediaResponse>>();
  const loadRelations = (node: AnimeSeasonNode) => {
    const cached = responseCache.get(node.identityRef);

    if (cached) return cached;

    const response = loadRelatedMedia(node.ids);
    responseCache.set(node.identityRef, response);
    return response;
  };
  const continuation = async (node: AnimeSeasonNode, kind: 'prequel' | 'sequel') => {
    const bridgeIds = new Set([node.identityRef]);
    for (let hop = 0; hop <= 3; hop += 1) {
      const response = await loadRelations(node);
      const next = selectRelation(response.relations, kind);
      if (next.candidate || next.ambiguous) return next;
      // Follow story links regardless of the intermediate release's format.
      // Films/specials connect seasons without becoming numbered TV seasons.
      const bridge = selectRelation(response.relations, kind, true);
      if (bridge.ambiguous) return bridge;
      if (!bridge.candidate || bridgeIds.has(bridge.candidate.identityRef)) break;
      bridgeIds.add(bridge.candidate.identityRef);
      node = bridge.candidate;
    }
    return { candidate: undefined, ambiguous: false };
  };
  const visited = new Set([initialNode.identityRef]);
  const chain: AnimeSeasonNode[] = [initialNode];
  let cursor = initialNode;

  while (chain.length < MAX_ANIME_SEASON_CHAIN_LENGTH) {
    const { candidate: prequel, ambiguous } = await continuation(cursor, 'prequel');

    if (ambiguous) return [];
    if (!prequel || visited.has(prequel.identityRef)) break;

    visited.add(prequel.identityRef);
    chain.unshift(prequel);
    cursor = prequel;
  }

  for (let index = 0; index < chain.length - 1; index += 1) {
    const parent = chain[index];
    const child = chain[index + 1];
    const { candidate: sequel, ambiguous } = await continuation(parent, 'sequel');

    if (ambiguous || sequel?.identityRef !== child.identityRef) return [];
  }

  cursor = initialNode;

  while (chain.length < MAX_ANIME_SEASON_CHAIN_LENGTH) {
    const { candidate: sequel, ambiguous } = await continuation(cursor, 'sequel');

    if (ambiguous || !sequel || visited.has(sequel.identityRef)) break;

    const { candidate: reciprocalPrequel, ambiguous: ambiguousPrequel } = await continuation(
      sequel,
      'prequel',
    );

    if (ambiguousPrequel || reciprocalPrequel?.identityRef !== cursor.identityRef) break;

    visited.add(sequel.identityRef);
    chain.push(sequel);
    cursor = sequel;
  }

  if (loadReleaseDetails) {
    await Promise.all(
      chain.map(async (node) => {
        const release = await loadReleaseDetails(node.ids);
        if (
          !release ||
          release.type !== 'anime' ||
          !isAnimeSeasonKind(release.animeKind) ||
          !release.ids ||
          createAnimeIdentityRef(release.ids) !== node.identityRef
        )
          return;
        node.titles = [...new Set([...node.titles, ...releaseTitles(release)])];
        node.declaredSeason = declaredSeason(release) ?? node.declaredSeason;
        // Use the same release metadata regardless of which part opened the page.
        // AniList can include episode 0 in its count while Shikimori excludes it.
        if ((release.episodesCount ?? 0) > 0) node.episodesCount = release.episodesCount!;
      }),
    );
  }

  const releaseEpisodeCounts = chain.map(({ episodesCount }) => episodesCount);
  const releaseGroups = groupAnimeReleases(chain);
  const canonicalSeasonEpisodeCounts = getCanonicalSeasonEpisodeCounts(details);
  const mapCanonicalSeasons = canonicalSeasonEpisodeCounts
    ? (await import('@media-engine/core')).mapAnimeReleasesToCanonicalSeasons
    : undefined;
  let canonicalMapping: ReturnType<NonNullable<typeof mapCanonicalSeasons>> = undefined;

  if (mapCanonicalSeasons && canonicalSeasonEpisodeCounts) {
    for (let length = releaseEpisodeCounts.length; length > 0 && !canonicalMapping; length -= 1) {
      const candidate = mapCanonicalSeasons(
        releaseEpisodeCounts.slice(0, length),
        canonicalSeasonEpisodeCounts,
      );
      // Generic TV databases may put every Re:Zero season in one continuous
      // season. Counts alone must not override the anime's declared seasons.
      if (
        candidate?.every(
          (mapping, index) =>
            chain[index].declaredSeason === undefined ||
            chain[index].declaredSeason === mapping.canonicalSeasonNumber,
        )
      )
        canonicalMapping = candidate;
    }
  }

  const mappedReleaseCount = canonicalMapping?.length ?? 0;
  const lastMappedSeasonNumber = canonicalMapping?.at(-1)?.canonicalSeasonNumber ?? 0;
  const mappedGroupNumber = releaseGroups[mappedReleaseCount - 1]?.number ?? 0;
  let fallbackAbsoluteOffset = 0;

  return chain.map(({ mediaRef: nodeMediaRef, title, year, episodesCount, ids }, releaseIndex) => {
    const mapping = canonicalMapping?.[releaseIndex];
    const entry: AnimeSeasonChainEntry = {
      number:
        mapping?.canonicalSeasonNumber ??
        (mappedReleaseCount > 0
          ? lastMappedSeasonNumber + releaseGroups[releaseIndex].number - mappedGroupNumber
          : releaseGroups[releaseIndex].number),
      releaseIndex,
      mediaRef: nodeMediaRef,
      title,
      year,
      episodesCount,
      seasonEpisodeOffset:
        mapping?.canonicalSeasonEpisodeOffset ?? releaseGroups[releaseIndex].seasonEpisodeOffset,
      absoluteEpisodeOffset: mapping?.canonicalAbsoluteEpisodeOffset ?? fallbackAbsoluteOffset,
      canonicalMappingVerified: mapping !== undefined,
      ids,
    };

    fallbackAbsoluteOffset += episodesCount;
    return entry;
  });
}
