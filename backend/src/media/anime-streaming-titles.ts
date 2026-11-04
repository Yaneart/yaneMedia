import type { DetailsResponse, ExternalIds, StreamingProvider } from '@media-engine/core';
import { parseAnimePart } from './anime-release-grouping';

type LoadDetails = (ids: ExternalIds, signal?: AbortSignal) => Promise<DetailsResponse>;

// The provider still checks exact title + year. Aliases come only from the
// requested anime identity; a similar franchise title is not sufficient.
export function withAnimeStreamingTitles(
  provider: StreamingProvider,
  loadDetails: LoadDetails,
): StreamingProvider {
  return {
    ...provider,
    async getAvailability(query, context) {
      const release = query.animeReleaseEpisode;
      const offset = (query.episodeNumber ?? 0) - (release?.releaseEpisodeNumber ?? 0);
      const result =
        query.type === 'anime' && offset > 0 && !parseAnimePart(query.title ?? '')
          ? null
          : await provider.getAvailability(query, context);
      if (result || query.type !== 'anime') return result;
      const ids = Object.fromEntries(
        (['shikimori', 'myAnimeList', 'aniList'] as const)
          .filter((key) => query.ids?.[key])
          .map((key) => [key, query.ids![key]]),
      );
      if (Object.keys(ids).length === 0) return null;
      const { details } = await loadDetails(ids, context.signal);
      if (
        !details ||
        details.type !== 'anime' ||
        details.year !== query.year ||
        !Object.entries(ids).some(
          ([key, value]) => details.ids?.[key as keyof ExternalIds] === value,
        )
      )
        return null;
      const aliases = [
        ...new Set([details.title, details.originalTitle, ...(details.alternativeTitles ?? [])]),
      ].filter((title): title is string => Boolean(title?.trim()));
      const part = [details.originalTitle, details.title, query.title]
        .map((title) => parseAnimePart(title ?? ''))
        .find((parsed) => parsed !== null)?.part;
      const qualified =
        part && part > 1
          ? aliases.filter((title) => parseAnimePart(title)?.part === part)
          : aliases;
      const variants =
        part && part > 1
          ? qualified
              .filter((title) => /\b(?:part|cour)\b/iu.test(title))
              .flatMap((title) => {
                const base = parseAnimePart(title)!.base;
                const ordinal = part === 2 ? '2nd' : part === 3 ? '3rd' : `${part}th`;
                return [`${base} ${ordinal} Cour`, `${base} Cour ${part}`];
              })
          : [];
      const titles = [...new Set([...qualified, ...variants])].filter(
        (title) => title !== query.title,
      );
      for (const title of titles.slice(0, part ? 8 : 3)) {
        const candidate = await provider.getAvailability({ ...query, title }, context);
        if (candidate) return { ...candidate, query };
      }
      // A provider may combine both cours in one release. Only use an
      // unqualified title with a proved prefix and the season-local episode.
      if (!part || part < 2 || !release || offset < 1) return null;
      let start = release.releaseIndex;
      let remaining = offset;
      while (start > 0 && remaining > 0) remaining -= release.releaseEpisodeCounts[--start];
      if (remaining !== 0) return null;
      const releaseEpisodeCounts = [
        ...release.releaseEpisodeCounts.slice(0, start),
        offset + release.releaseEpisodeCounts[release.releaseIndex],
        ...release.releaseEpisodeCounts.slice(release.releaseIndex + 1),
      ];
      const bases = [...new Set(qualified.map((title) => parseAnimePart(title)!.base))];
      for (const title of bases.slice(0, 3)) {
        const candidate = await provider.getAvailability(
          {
            ...query,
            title,
            animeReleaseEpisode: {
              releaseIndex: start,
              releaseEpisodeNumber: offset + release.releaseEpisodeNumber,
              releaseEpisodeCounts,
            },
          },
          context,
        );
        if (candidate) return { ...candidate, query };
      }
      return null;
    },
  };
}
