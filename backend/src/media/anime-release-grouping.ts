interface AnimeReleaseTitles {
  titles: readonly string[];
  episodesCount: number;
}

const PART =
  /(?:\b(?:part|cour)\s*([1-9]\d?)\b|\b([1-9]\d?)(?:st|nd|rd|th)\s+cour\b|часть\s*([1-9]\d?))/iu;

export function parseAnimePart(title: string) {
  const match = PART.exec(title);
  return match
    ? {
        base: title
          .replace(PART, '')
          .trim()
          .replace(/[ .:–—-]+$/u, ''),
        part: Number(match[1] ?? match[2] ?? match[3]),
      }
    : null;
}

function normalizeTitle(title: string): string {
  return title
    .normalize('NFKC')
    .toLowerCase()
    .replaceAll('×', 'x')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function titleParts(titles: readonly string[]) {
  return titles.map((title) => {
    const parsed = parseAnimePart(title);
    return {
      base: normalizeTitle(parsed?.base ?? title),
      part: parsed?.part ?? 1,
    };
  });
}

// A reciprocal sequel is a new release, but an explicitly numbered cour/part
// continues its predecessor. Match full title aliases, never just "Part 2".
export function groupAnimeReleases(releases: readonly AnimeReleaseTitles[]) {
  let number = 0;
  let seasonEpisodeOffset = 0;
  return releases.map((release, index) => {
    const previous = releases[index - 1];
    const previousTitles = previous ? titleParts(previous.titles) : [];
    const continues = titleParts(release.titles).some(
      ({ base, part }) =>
        base.length > 1 &&
        part > 1 &&
        previousTitles.some((candidate) => candidate.base === base && candidate.part === part - 1),
    );
    if (continues && previous) seasonEpisodeOffset += previous.episodesCount;
    else {
      number += 1;
      seasonEpisodeOffset = 0;
    }
    return { number, seasonEpisodeOffset };
  });
}
