import type { MediaSummary } from '@/entities/media';

function normalizeLibraryQuery(value: string) {
  return value
    .trim()
    .toLocaleLowerCase('ru-RU')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

export function matchesLibraryQuery(media: MediaSummary, query: string) {
  const normalizedQuery = normalizeLibraryQuery(query);

  if (!normalizedQuery) {
    return true;
  }

  return [media.title, media.originalTitle].some((title) =>
    title ? normalizeLibraryQuery(title).includes(normalizedQuery) : false,
  );
}
