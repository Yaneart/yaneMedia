import type { AnimeKind } from '@media-engine/core';

// TV and web series both have numbered seasons. OVA/special releases remain
// bridges between seasons, and movies/music are separate works.
export function isAnimeSeasonKind(kind: AnimeKind | undefined): boolean {
  return kind === 'tv' || kind === 'ona';
}
