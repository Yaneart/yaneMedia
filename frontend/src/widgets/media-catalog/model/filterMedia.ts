import type { MediaSummary } from '@/entities/media';

export type FilterMediaParams = {
  media: readonly MediaSummary[];
  searchValue: string;
  selectedGenre: string | null;
  selectedYear: number | null;
  minimumRating: number | null;
};

export function filterMedia({
  media,
  searchValue,
  selectedGenre,
  selectedYear,
  minimumRating,
}: FilterMediaParams) {
  const query = searchValue.trim().toLocaleLowerCase();

  return media.filter((item) => {
    const searchableTitles = [item.title, item.originalTitle].filter((title): title is string =>
      Boolean(title),
    );

    const matchesSearch =
      !query || searchableTitles.some((title) => title.toLocaleLowerCase().includes(query));

    const matchesGenre = selectedGenre === null || item.genres.includes(selectedGenre);
    const matchesYear = selectedYear === null || item.year === selectedYear;
    const matchesRating =
      minimumRating === null || (item.rating !== undefined && item.rating.value >= minimumRating);

    return matchesSearch && matchesGenre && matchesYear && matchesRating;
  });
}
