import type { AnimeKind } from '@media-engine/core';

// Only TV/web releases become numbered seasons. Other release formats can
// connect the story without adding a season; this does not restrict streaming.
export function isAnimeSeasonKind(kind: AnimeKind | undefined): boolean {
  return kind === 'tv' || kind === 'ona';
}
