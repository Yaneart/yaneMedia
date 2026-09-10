import { normalizeMediaSearchQuery, type MediaType } from '@/entities/media';
import type { SelectOption } from '@/shared';
import { getGenreOptions } from './genreOptions';
import { getYearOptions } from './yearOptions';

export type CatalogSearchFilters = {
  query: string;
  genre: string | null;
  year: number | null;
  minimumRating: number | null;
};

export const ratingOptions = [
  { value: '7', label: '7+' },
  { value: '8', label: '8+' },
  { value: '9', label: '9+' },
] as const satisfies readonly SelectOption[];

function findOptionValue(value: string | null, options: readonly SelectOption[]) {
  const normalizedValue = value?.trim().toLocaleLowerCase('en') ?? '';

  return (
    options.find((option) => option.value.toLocaleLowerCase('en') === normalizedValue)?.value ??
    null
  );
}

export function readCatalogSearchParams(
  searchParams: URLSearchParams,
  type: MediaType,
): CatalogSearchFilters {
  const yearValue = findOptionValue(searchParams.get('year'), getYearOptions(type));
  const ratingValue = findOptionValue(searchParams.get('rating'), ratingOptions);

  return {
    query: normalizeMediaSearchQuery(searchParams.get('q')),
    genre: findOptionValue(searchParams.get('genre'), getGenreOptions(type)),
    year: yearValue === null ? null : Number(yearValue),
    minimumRating: ratingValue === null ? null : Number(ratingValue),
  };
}

export function createCatalogSearchParams(filters: CatalogSearchFilters): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (filters.query) searchParams.set('q', filters.query);
  if (filters.genre) searchParams.set('genre', filters.genre);
  if (filters.year !== null) searchParams.set('year', String(filters.year));
  if (filters.minimumRating !== null) {
    searchParams.set('rating', String(filters.minimumRating));
  }

  return searchParams;
}
