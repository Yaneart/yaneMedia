import { useState, type ReactNode } from 'react';

import { Button, EmptyState, MediaGrid, SearchInput, Select } from '@/shared';
import { MediaCard, type MediaRef, type MediaSummary } from '@/entities/media';
import { filterMedia } from '../model/filterMedia';
import { useFavorites } from '@/features/favorite';

export type MediaCatalogProps = {
  title: string;
  media: readonly MediaSummary[];
  onOpen: (mediaRef: MediaRef) => void;
  filters?: ReactNode;
};

const ratingOptions = [
  { value: '7', label: '7+' },
  { value: '8', label: '8+' },
  { value: '9', label: '9+' },
] as const;

export function MediaCatalog({ title, filters, media, onOpen }: MediaCatalogProps) {
  const { isFavorite, toggleFavorite } = useFavorites();

  const [searchValue, setSearchValue] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [minimumRating, setMinimumRating] = useState<number | null>(null);

  const availableGenres = [...new Set(media.flatMap((item) => item.genres))].sort((first, second) =>
    first.localeCompare(second, 'ru'),
  );

  const genreOptions = availableGenres.map((genre) => ({
    value: genre,
    label: genre,
  }));

  const availableYears = [
    ...new Set(media.map((item) => item.year).filter((year): year is number => year !== undefined)),
  ].sort((first, second) => second - first);

  const yearOptions = availableYears.map((year) => ({
    value: String(year),
    label: String(year),
  }));

  const filteredMedia = filterMedia({
    media,
    searchValue,
    selectedGenre,
    selectedYear,
    minimumRating,
  });

  const hasActiveFilters =
    searchValue.trim().length > 0 ||
    selectedGenre !== null ||
    selectedYear !== null ||
    minimumRating !== null;

  const resetFilters = () => {
    setSearchValue('');
    setSelectedGenre(null);
    setSelectedYear(null);
    setMinimumRating(null);
  };

  return (
    <section>
      <div className="mb-6 flex flex-col gap-4">
        <h1 className="text-title font-semibold">{title}</h1>
        <SearchInput
          aria-label={`Поиск: ${title}`}
          value={searchValue}
          placeholder="Поиск по каталогу"
          onChange={(event) => setSearchValue(event.currentTarget.value)}
        />
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center">
          <Select
            aria-label="Жанр"
            value={selectedGenre}
            options={genreOptions}
            placeholder="Все жанры"
            onChange={setSelectedGenre}
          />
          <Select
            aria-label="Год"
            value={selectedYear === null ? null : String(selectedYear)}
            options={yearOptions}
            placeholder="Все годы"
            onChange={(value) => setSelectedYear(value === null ? null : Number(value))}
          />
          <Select
            aria-label="Минимальный рейтинг"
            value={minimumRating === null ? null : String(minimumRating)}
            options={ratingOptions}
            placeholder="Любой рейтинг"
            onChange={(value) => setMinimumRating(value === null ? null : Number(value))}
            className="col-span-2 sm:col-span-1"
          />
          {hasActiveFilters && (
            <Button
              size="small"
              variant="ghost"
              className="col-span-2 justify-self-start sm:col-span-1"
              onClick={resetFilters}
            >
              Сбросить
            </Button>
          )}
          {filters}
        </div>
      </div>
      {filteredMedia.length > 0 ? (
        <MediaGrid>
          {filteredMedia.map((item) => (
            <MediaCard
              key={item.mediaRef}
              media={item}
              onOpen={() => onOpen(item.mediaRef)}
              isFavorite={isFavorite(item.mediaRef)}
              onFavoriteChange={() => toggleFavorite(item.mediaRef)}
            />
          ))}
        </MediaGrid>
      ) : (
        <EmptyState
          title="Ничего не найдено"
          description="Попробуйте изменить запрос или выбранные фильтры."
          action={
            <Button variant="secondary" onClick={resetFilters}>
              Сбросить фильтры
            </Button>
          }
        />
      )}
    </section>
  );
}
