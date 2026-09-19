import type {
  ExternalIds,
  MediaDetails,
  MediaRelation,
  RelatedMediaItem,
  RelatedMediaResponse,
} from '@media-engine/core';
import { createMediaRef } from './media-ref';

export const MAX_ANIME_SEASON_CHAIN_LENGTH = 12;

export interface AnimeSeasonChainEntry {
  mediaRef: string;
  title: string;
  year?: number;
  episodesCount: number;
}

interface AnimeSeasonNode extends AnimeSeasonChainEntry {
  ids: ExternalIds;
  identityRef: string;
}

type LoadRelatedMedia = (ids: ExternalIds) => Promise<RelatedMediaResponse>;

function createAnimeIdentityRef(ids: ExternalIds): string | undefined {
  const myAnimeList = ids.myAnimeList?.trim() || ids.shikimori?.trim();

  if (myAnimeList && /^\d{1,12}$/.test(myAnimeList)) {
    return `myanimelist:${myAnimeList}`;
  }

  return createMediaRef(ids, 'anime');
}

function isPlayableTvAnime(item: RelatedMediaItem): boolean {
  const isReleased =
    item.status === 'released' || item.status === 'ended' || item.status === 'ongoing';

  return (
    item.type === 'anime' && item.animeKind === 'tv' && isReleased && (item.episodesCount ?? 0) > 0
  );
}

function toRelatedNode(relation: MediaRelation): AnimeSeasonNode | undefined {
  if (!isPlayableTvAnime(relation.item) || !relation.item.ids) return undefined;

  const mediaRef = createMediaRef(relation.item.ids, 'anime');
  const identityRef = createAnimeIdentityRef(relation.item.ids);

  if (!mediaRef || !identityRef) return undefined;

  return {
    mediaRef,
    identityRef,
    ids: relation.item.ids,
    title: relation.item.title,
    year: relation.item.year,
    episodesCount: relation.item.episodesCount!,
  };
}

function selectRelation(
  relations: readonly MediaRelation[],
  kind: 'prequel' | 'sequel',
): { candidate?: AnimeSeasonNode; ambiguous: boolean } {
  const candidates = new Map<string, AnimeSeasonNode>();

  for (const relation of relations) {
    if (relation.kind !== kind) continue;

    const candidate = toRelatedNode(relation);

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
    details.animeKind !== 'tv' ||
    (details.status !== 'released' && details.status !== 'ended' && details.status !== 'ongoing') ||
    !details.ids
  ) {
    return undefined;
  }

  const episodesCount = details.episodesCount ?? details.episodes?.length ?? 0;

  if (episodesCount <= 0) return undefined;

  return {
    mediaRef,
    identityRef: createAnimeIdentityRef(details.ids) ?? mediaRef,
    ids: details.ids,
    title: details.title,
    year: details.year,
    episodesCount,
  };
}

export async function buildAnimeSeasonChain(
  mediaRef: string,
  details: MediaDetails,
  loadRelatedMedia: LoadRelatedMedia,
): Promise<AnimeSeasonChainEntry[]> {
  const initialNode = toInitialNode(mediaRef, details);

  if (!initialNode) return [];

  const responseCache = new Map<string, Promise<RelatedMediaResponse>>();
  const loadRelations = (node: AnimeSeasonNode) => {
    const cached = responseCache.get(node.identityRef);

    if (cached) return cached;

    const response = loadRelatedMedia(node.ids);
    responseCache.set(node.identityRef, response);
    return response;
  };
  const visited = new Set([initialNode.identityRef]);
  const chain: AnimeSeasonNode[] = [initialNode];
  let cursor = initialNode;

  while (chain.length < MAX_ANIME_SEASON_CHAIN_LENGTH) {
    const response = await loadRelations(cursor);
    const { candidate: prequel, ambiguous } = selectRelation(response.relations, 'prequel');

    if (ambiguous) return [];
    if (!prequel || visited.has(prequel.identityRef)) break;

    visited.add(prequel.identityRef);
    chain.unshift(prequel);
    cursor = prequel;
  }

  for (let index = 0; index < chain.length - 1; index += 1) {
    const parent = chain[index];
    const child = chain[index + 1];
    const response = await loadRelations(parent);
    const { candidate: sequel, ambiguous } = selectRelation(response.relations, 'sequel');

    if (ambiguous || sequel?.identityRef !== child.identityRef) return [];
  }

  cursor = initialNode;

  while (chain.length < MAX_ANIME_SEASON_CHAIN_LENGTH) {
    const response = await loadRelations(cursor);
    const { candidate: sequel, ambiguous } = selectRelation(response.relations, 'sequel');

    if (ambiguous || !sequel || visited.has(sequel.identityRef)) break;

    const sequelResponse = await loadRelations(sequel);
    const { candidate: reciprocalPrequel, ambiguous: ambiguousPrequel } = selectRelation(
      sequelResponse.relations,
      'prequel',
    );

    if (ambiguousPrequel || reciprocalPrequel?.identityRef !== cursor.identityRef) break;

    visited.add(sequel.identityRef);
    chain.push(sequel);
    cursor = sequel;
  }

  return chain.map(({ mediaRef: nodeMediaRef, title, year, episodesCount }) => ({
    mediaRef: nodeMediaRef,
    title,
    year,
    episodesCount,
  }));
}
