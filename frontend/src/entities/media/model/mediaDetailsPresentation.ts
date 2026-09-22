import type { MediaDetails, MediaSummary } from './media';

export function createMediaDetailsShell(summary: MediaSummary): MediaDetails {
  const common = {
    ...summary,
    description: summary.shortDescription,
    countries: [],
    languages: [],
    persons: [],
  };

  switch (summary.type) {
    case 'movie':
      return { ...common, type: 'movie' };
    case 'series':
      return { ...common, type: 'series', seasons: [] };
    case 'anime':
      return { ...common, type: 'anime', episodes: [] };
  }
}

export function enrichMediaDetails(
  details: MediaDetails,
  summary: MediaSummary | null,
): MediaDetails {
  if (!summary || summary.mediaRef !== details.mediaRef || summary.type !== details.type) {
    return details;
  }

  return {
    ...details,
    title: summary.title,
    originalTitle: summary.originalTitle ?? details.originalTitle,
    year: summary.year ?? details.year,
    shortDescription: summary.shortDescription ?? details.shortDescription,
    poster: summary.poster ?? details.poster,
    backdrop: summary.backdrop ?? details.backdrop,
    genres: summary.genres.length > 0 ? summary.genres : details.genres,
    rating: summary.rating ?? details.rating,
  };
}

export function resolveMediaDetailsPresentation(
  summary: MediaSummary | null,
  details: MediaDetails | null,
): MediaDetails | null {
  if (details) return enrichMediaDetails(details, summary);
  return summary ? createMediaDetailsShell(summary) : null;
}
