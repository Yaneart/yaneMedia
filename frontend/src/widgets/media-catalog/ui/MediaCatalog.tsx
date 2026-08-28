import { useId, useState, type ReactNode } from 'react';

import { Button, DownIcon, EmptyState, MediaGrid, SearchInput, Select, YaneMark } from '@/shared';
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
  const filtersPanelId = useId();

  const [searchValue, setSearchValue] = useState('');
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [minimumRating, setMinimumRating] = useState<number | null>(null);
  const [areMobileFiltersOpen, setAreMobileFiltersOpen] = useState(false);

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
  const activeSelectFiltersCount = [selectedGenre, selectedYear, minimumRating].filter(
    (value) => value !== null,
  ).length;
  const activeFilterLabels = [
    searchValue.trim() ? `Поиск: «${searchValue.trim()}»` : null,
    selectedGenre,
    selectedYear?.toString(),
    minimumRating === null ? null : `Рейтинг ${minimumRating}+`,
  ].filter((label): label is string => label !== null);

  const resetFilters = () => {
    setSearchValue('');
    setSelectedGenre(null);
    setSelectedYear(null);
    setMinimumRating(null);
  };

  return (
    <section>
      <header
        className={[
          'relative rounded-card',
          'bg-linear-to-br from-watermark/20 via-surface-elevated to-surface-elevated',
          'px-5 py-6 shadow-sm sm:px-7 sm:py-7',
          'xl:grid xl:grid-cols-[minmax(16rem,0.65fr)_minmax(34rem,1.35fr)]',
          'xl:items-center xl:gap-10 xl:px-10 xl:py-8',
        ].join(' ')}
      >
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-card">
          <YaneMark
            className={[
              'absolute -top-20 -right-12 hidden size-80 rotate-12',
              'text-watermark opacity-watermark sm:block',
            ].join(' ')}
          />
        </div>

        <div className="relative">
          <p className="text-caption font-semibold tracking-[0.14em] text-accent-text uppercase">
            Каталог yaneMedia
          </p>

          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            {title}
          </h1>

          <p className="mt-2 max-w-md text-body text-text-secondary">
            Ищите по названию и уточняйте выбор по жанру, году и рейтингу.
          </p>
        </div>

        <div className="relative mt-5 xl:mt-0">
          <SearchInput
            aria-label={`Поиск: ${title}`}
            value={searchValue}
            placeholder="Поиск по каталогу"
            onChange={(event) => setSearchValue(event.currentTarget.value)}
          />

          <Button
            variant="secondary"
            className="mt-3 w-full justify-between sm:hidden"
            aria-expanded={areMobileFiltersOpen}
            aria-controls={filtersPanelId}
            onClick={() => setAreMobileFiltersOpen((current) => !current)}
          >
            <span className="flex items-center gap-2">
              Фильтры
              {activeSelectFiltersCount > 0 && (
                <span className="flex size-5 items-center justify-center rounded-full bg-action text-xs text-action-text">
                  {activeSelectFiltersCount}
                </span>
              )}
            </span>
            <DownIcon
              aria-hidden="true"
              className={[
                'size-4 transition-transform duration-200',
                areMobileFiltersOpen ? 'rotate-180' : '',
              ].join(' ')}
            />
          </Button>

          <div
            id={filtersPanelId}
            className={[
              'mt-3 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center',
              'xl:flex-nowrap',
              areMobileFiltersOpen ? 'grid' : 'hidden sm:flex',
            ].join(' ')}
          >
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
            {filters}
          </div>
        </div>
      </header>

      <div className="mt-6 mb-5 flex min-h-8 flex-wrap items-center justify-between gap-3">
        <p className="text-caption text-text-secondary">
          Показано: <span className="font-semibold text-text-primary">{filteredMedia.length}</span>{' '}
          из {media.length}
        </p>

        {hasActiveFilters && (
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            {activeFilterLabels.map((label) => (
              <span
                key={label}
                className="max-w-full truncate rounded-full bg-watermark/10 px-3 py-1 text-caption text-text-secondary"
              >
                {label}
              </span>
            ))}
            <Button size="small" variant="ghost" onClick={resetFilters}>
              Сбросить
            </Button>
          </div>
        )}
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
