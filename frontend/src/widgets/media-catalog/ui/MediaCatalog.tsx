import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';

import {
  Button,
  DownIcon,
  EmptyState,
  ErrorState,
  LoadingState,
  MediaGrid,
  SearchInput,
  Select,
  YaneMark,
} from '@/shared';
import {
  maximumMediaSearchQueryLength,
  MediaCard,
  normalizeMediaSearchQuery,
  useMediaSearch,
  type MediaRef,
  type MediaType,
} from '@/entities/media';
import { useFavorites } from '@/features/favorite';
import { RestorableContentRow } from '@/features/scroll-restoration';
import {
  createCatalogSearchParams,
  ratingOptions,
  readCatalogSearchParams,
  type CatalogSearchFilters,
} from '../model/catalogSearchParams';
import { getGenreOptions } from '../model/genreOptions';
import { useMediaCatalog } from '../model/useMediaCatalog';
import { getYearOptions } from '../model/yearOptions';
import { MediaCatalogSkeleton } from './MediaCatalogSkeleton';

export type MediaCatalogProps = {
  type: MediaType;
  title: string;
  onOpen: (mediaRef: MediaRef) => void;
  filters?: ReactNode;
};

export function MediaCatalog({ type, title, filters, onOpen }: MediaCatalogProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { catalog, isError, isFetching, isPaused, retry } = useMediaCatalog(type);
  const { isFavorite, toggleFavorite } = useFavorites();
  const filtersPanelId = useId();

  const urlFilters = useMemo(
    () => readCatalogSearchParams(searchParams, type),
    [searchParams, type],
  );
  const [searchValue, setSearchValue] = useState(urlFilters.query);
  const [areMobileFiltersOpen, setAreMobileFiltersOpen] = useState(false);
  const { genre: selectedGenre, year: selectedYear, minimumRating } = urlFilters;
  const normalizedSearchValue = normalizeMediaSearchQuery(searchValue);

  useEffect(() => {
    const canonicalParams = createCatalogSearchParams(urlFilters);

    if (canonicalParams.toString() !== searchParams.toString()) {
      setSearchParams(canonicalParams, { replace: true });
    }
  }, [searchParams, setSearchParams, urlFilters]);

  useEffect(() => {
    setSearchValue(urlFilters.query);
  }, [urlFilters.query]);

  useEffect(() => {
    if (normalizedSearchValue === urlFilters.query) return;

    const timeoutId = window.setTimeout(() => {
      setSearchParams(createCatalogSearchParams({ ...urlFilters, query: normalizedSearchValue }), {
        replace: true,
      });
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [normalizedSearchValue, setSearchParams, urlFilters]);

  const updateUrlFilters = (updates: Partial<CatalogSearchFilters>) => {
    setSearchParams(createCatalogSearchParams({ ...urlFilters, ...updates }));
  };

  const hasSelectedFilters =
    selectedGenre !== null || selectedYear !== null || minimumRating !== null;
  const isResultsMode = normalizedSearchValue.length > 0 || hasSelectedFilters;
  const isSearchDraftPending = normalizedSearchValue !== urlFilters.query;
  const {
    items: searchItems,
    resultFilters,
    status: searchStatus,
    isPreviousResult: isPreviousQueryResult,
    isUpdating: isQueryUpdating,
    hasRefreshError: hasSearchRefreshError,
    hasMore,
    isLoadingMore,
    loadMoreError,
    retry: retrySearch,
    loadMore,
  } = useMediaSearch(
    {
      query: urlFilters.query,
      type,
      genre: selectedGenre,
      year: selectedYear,
      minimumRating,
    },
    0,
  );

  const isPreviousResult = isPreviousQueryResult || isSearchDraftPending;
  const isSearchUpdating = isQueryUpdating || isSearchDraftPending;

  if (!catalog && !isResultsMode && !isError && !isPaused) {
    return <MediaCatalogSkeleton title={title} />;
  }

  const catalogNotice = catalog
    ? isPaused
      ? 'Обновление ожидает подключения к сети. Показана сохранённая версия.'
      : isFetching
        ? 'Обновляем каталог…'
        : isError
          ? 'Не удалось обновить каталог. Показана сохранённая версия.'
          : catalog.partial
            ? 'Часть каталога временно недоступна. Показаны доступные произведения.'
            : catalog.stale
              ? 'Показана сохранённая версия каталога. Данные могут обновиться позже.'
              : null
    : null;

  const searchNotice = hasSearchRefreshError
    ? 'Не удалось обновить результаты. Показана сохранённая выдача.'
    : isSearchUpdating && resultFilters
      ? isPreviousResult
        ? 'Ищем новые результаты. Пока показана предыдущая выдача.'
        : 'Обновляем результаты поиска…'
      : null;

  const genreOptions = getGenreOptions(type);
  const selectedGenreLabel = genreOptions.find((option) => option.value === selectedGenre)?.label;

  const yearOptions = getYearOptions(type);

  const activeSelectFiltersCount = [selectedGenre, selectedYear, minimumRating].filter(
    (value) => value !== null,
  ).length;
  const activeFilterLabels = [
    normalizedSearchValue ? `Поиск: «${normalizedSearchValue}»` : null,
    selectedGenreLabel,
    selectedYear?.toString(),
    minimumRating === null ? null : `Рейтинг ${minimumRating}+`,
  ].filter((label): label is string => label != null);

  const resetFilters = () => {
    setSearchValue('');
    setSearchParams({});
  };

  return (
    <section aria-busy={isResultsMode && (searchStatus === 'loading' || isSearchUpdating)}>
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
            Подборки, поиск и фильтры относятся только к разделу «{title}».
          </p>
        </div>

        <div className="relative mt-5 xl:mt-0">
          <SearchInput
            aria-label={`Поиск: ${title}`}
            value={searchValue}
            maxLength={maximumMediaSearchQueryLength}
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
              onChange={(genre) => updateUrlFilters({ genre })}
            />
            <Select
              aria-label="Год"
              value={selectedYear === null ? null : String(selectedYear)}
              options={yearOptions}
              placeholder="Все годы"
              onChange={(value) =>
                updateUrlFilters({ year: value === null ? null : Number(value) })
              }
            />
            <Select
              aria-label="Минимальный рейтинг"
              value={minimumRating === null ? null : String(minimumRating)}
              options={ratingOptions}
              placeholder="Любой рейтинг"
              onChange={(value) =>
                updateUrlFilters({ minimumRating: value === null ? null : Number(value) })
              }
              className="col-span-2 sm:col-span-1"
            />
            {filters}
          </div>
        </div>
      </header>

      {!isResultsMode && catalogNotice && (
        <div
          role="status"
          className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-card border border-context-border bg-surface-elevated px-4 py-3"
        >
          <p className="text-caption text-text-secondary">{catalogNotice}</p>

          <Button size="small" variant="ghost" disabled={isFetching || isPaused} onClick={retry}>
            {isFetching ? 'Обновляем…' : 'Обновить'}
          </Button>
        </div>
      )}

      {isResultsMode && (
        <div className="mt-6 mb-5 flex min-h-8 flex-wrap items-center justify-between gap-3">
          <p className="text-caption text-text-secondary">
            Показано: <span className="font-semibold text-text-primary">{searchItems.length}</span>
          </p>

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
        </div>
      )}

      {isResultsMode && searchNotice && (
        <div
          role={hasSearchRefreshError ? 'alert' : 'status'}
          className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-card border border-context-border bg-surface-elevated px-4 py-3"
        >
          <p className="text-caption text-text-secondary">{searchNotice}</p>

          {hasSearchRefreshError && (
            <Button size="small" variant="ghost" onClick={retrySearch}>
              Повторить
            </Button>
          )}
        </div>
      )}

      {isResultsMode ? (
        searchStatus === 'idle' || searchStatus === 'loading' ? (
          <LoadingState label={`Ищем в разделе «${title}»`} />
        ) : searchStatus === 'paused' ? (
          <EmptyState
            title="Нет подключения к сети"
            description="Поиск начнётся, когда соединение восстановится."
            action={
              <Button variant="secondary" onClick={resetFilters}>
                Сбросить фильтры
              </Button>
            }
          />
        ) : searchStatus === 'error' ? (
          <ErrorState
            title="Не удалось выполнить поиск"
            description="Попробуйте изменить запрос или повторить немного позже."
            onRetry={retrySearch}
          />
        ) : searchItems.length > 0 ? (
          <div>
            <MediaGrid>
              {searchItems.map((item) => (
                <MediaCard
                  key={item.mediaRef}
                  media={item}
                  onOpen={() => onOpen(item.mediaRef)}
                  isFavorite={isFavorite(item.mediaRef)}
                  onFavoriteChange={() => toggleFavorite(item.mediaRef)}
                />
              ))}
            </MediaGrid>

            {(hasMore || loadMoreError) && (
              <div className="mt-8 flex flex-col items-center gap-3">
                {loadMoreError && (
                  <p role="alert" className="text-caption text-danger">
                    Не удалось загрузить следующую страницу.
                  </p>
                )}
                <Button disabled={isLoadingMore || isSearchUpdating} onClick={loadMore}>
                  {isLoadingMore
                    ? 'Загружаем…'
                    : loadMoreError
                      ? 'Попробовать снова'
                      : 'Показать ещё'}
                </Button>
              </div>
            )}
          </div>
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
        )
      ) : !catalog ? (
        isPaused ? (
          <EmptyState
            title="Нет подключения к сети"
            description="Загрузим каталог, когда соединение восстановится. Поиск по названию уже доступен."
            className="mt-6 min-h-[60vh]"
          />
        ) : (
          <ErrorState
            variant="page"
            eyebrow="Каталог yaneMedia"
            title={`Не удалось загрузить ${title.toLocaleLowerCase('ru')}`}
            description="Подборки недоступны, но вы можете воспользоваться поиском по названию."
            visualLabel="Каталог недоступен"
            retryLabel="Попробовать снова"
            onRetry={retry}
          />
        )
      ) : catalog.items.length === 0 ? (
        <EmptyState
          title="Каталог пока пуст"
          description={`В разделе «${title}» пока нет доступных произведений.`}
          action={
            <Button variant="secondary" disabled={isFetching || isPaused} onClick={retry}>
              Обновить каталог
            </Button>
          }
          className="min-h-[60vh]"
        />
      ) : (
        <div className="mt-8 space-y-10 md:mt-10">
          {catalog.collections.map((collection) => (
            <section key={collection.id} aria-labelledby={`collection-${collection.id}`}>
              <h2
                id={`collection-${collection.id}`}
                className="text-xl font-semibold tracking-tight text-text-primary sm:text-2xl"
              >
                {collection.title}
              </h2>

              <RestorableContentRow scrollKey={collection.id} className="mt-4">
                {collection.items.map((item) => (
                  <MediaCard
                    key={item.mediaRef}
                    media={item}
                    onOpen={() => onOpen(item.mediaRef)}
                    isFavorite={isFavorite(item.mediaRef)}
                    onFavoriteChange={() => toggleFavorite(item.mediaRef)}
                  />
                ))}
              </RestorableContentRow>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
