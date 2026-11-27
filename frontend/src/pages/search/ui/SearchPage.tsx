import { useEffect } from 'react';
import { useSearchParams } from 'react-router';

import {
  maximumMediaSearchQueryLength,
  MediaCard,
  normalizeMediaSearchQuery,
  useMediaSearch,
  useMediaSearchDraft,
} from '@/entities/media';
import { useFavorites } from '@/features/favorite';
import {
  Button,
  EmptyState,
  ErrorState,
  InfiniteScroll,
  MediaGrid,
  SearchInput,
  LoadingState,
  YaneMark,
  YaneMarkField,
} from '@/shared';

const searchSuggestions = ['Дюна', 'Игра престолов', 'Фрирен'] as const;

function createSearchParams(query: string) {
  return new URLSearchParams(query ? { q: query } : undefined);
}

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isFavorite, isFavoriteUpdating, toggleFavorite, canUpdateFavorites } = useFavorites();

  const urlQuery = normalizeMediaSearchQuery(searchParams.get('q'));
  const { searchValue, setSearchValue, normalizedSearchValue, isSearchDraftPending } =
    useMediaSearchDraft(urlQuery, (query) =>
      setSearchParams(createSearchParams(query), { replace: true }),
    );
  const {
    items: results,
    resultFilters,
    status: searchStatus,
    isPreviousResult: isPreviousQueryResult,
    isUpdating: isQueryUpdating,
    hasRefreshError,
    pagination,
    retry,
  } = useMediaSearch({ query: urlQuery }, 0);

  useEffect(() => {
    const canonicalParams = createSearchParams(urlQuery);

    if (canonicalParams.toString() !== searchParams.toString()) {
      setSearchParams(canonicalParams, { replace: true });
    }
  }, [searchParams, setSearchParams, urlQuery]);

  const startSearch = (searchQuery: string) => {
    setSearchValue(searchQuery);
    setSearchParams(createSearchParams(searchQuery));
  };

  const displayedQuery = resultFilters?.query ?? urlQuery;
  const isPreviousResult = isPreviousQueryResult || isSearchDraftPending;
  const isUpdating = Boolean(normalizedSearchValue) && (isQueryUpdating || isSearchDraftPending);
  const status = !normalizedSearchValue
    ? 'idle'
    : isSearchDraftPending && searchStatus !== 'success'
      ? 'loading'
      : searchStatus;
  const searchNotice =
    status === 'idle' || status === 'loading'
      ? null
      : isUpdating && resultFilters
        ? isPreviousResult
          ? `Ищем «${normalizedSearchValue}». Пока показаны результаты по запросу «${displayedQuery}».`
          : 'Обновляем результаты поиска…'
        : hasRefreshError
          ? 'Не удалось обновить результаты. Показана сохранённая выдача.'
          : null;
  const searchResultsAnnouncement =
    !isUpdating && !isPreviousResult
      ? status === 'success'
        ? `По запросу «${displayedQuery}» найдено результатов: ${results.length}.`
        : status === 'empty'
          ? `По запросу «${displayedQuery}» ничего не найдено.`
          : ''
      : '';

  return (
    <section className="space-y-6" aria-busy={status === 'loading' || isUpdating}>
      <p role="status" aria-atomic="true" className="sr-only">
        {searchResultsAnnouncement}
      </p>

      <header
        className={[
          'relative isolate overflow-hidden rounded-card border border-context-border',
          'bg-linear-to-br from-watermark/38 via-watermark/26 to-watermark/32 p-2 shadow-surface sm:p-3',
        ].join(' ')}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        >
          <YaneMarkField />
          <YaneMark className="absolute -top-20 -right-12 hidden size-80 rotate-12 text-watermark opacity-watermark sm:block" />
        </div>

        <div
          className={[
            'relative z-10 grid rounded-card border border-context-border/80 bg-surface/35',
            'px-5 py-6 sm:px-7 sm:py-7',
            'lg:grid lg:grid-cols-[minmax(18rem,0.75fr)_minmax(28rem,1.25fr)]',
            'lg:items-center lg:gap-10 lg:px-10 lg:py-8 wide:media-search-columns',
          ].join(' ')}
        >
          <div className="relative">
            <p className="text-caption font-semibold tracking-[0.14em] text-accent-text uppercase">
              Поиск по каталогу
            </p>

            <h1
              data-page-heading
              tabIndex={-1}
              className="mt-2 text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl"
            >
              Что будем смотреть?
            </h1>

            <p className="mt-2 max-w-md text-body text-text-secondary">
              Фильмы, сериалы и аниме — в одном поиске.
            </p>
          </div>

          <div className="relative mt-5 lg:mt-0">
            <SearchInput
              data-page-search
              aria-label="Название произведения"
              value={searchValue}
              maxLength={maximumMediaSearchQueryLength}
              placeholder="Введите название"
              className="wide:min-h-12"
              onChange={(event) => setSearchValue(event.currentTarget.value)}
            />

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-caption text-text-secondary">Попробуйте:</span>

              {searchSuggestions.map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="ghost"
                  size="small"
                  className="rounded-full bg-watermark/10 text-text-primary hover:bg-watermark/20"
                  onClick={() => startSearch(suggestion)}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {status === 'loading' && <LoadingState label={`Поиск: ${normalizedSearchValue}`} />}

      {status === 'paused' && (
        <EmptyState
          title="Нет подключения к сети"
          description="Поиск начнётся, когда соединение восстановится."
          className="min-h-64 rounded-card bg-surface-elevated"
        />
      )}

      {status === 'error' && (
        <ErrorState
          variant="section"
          title="Не удалось выполнить поиск"
          description="Проверьте подключение и попробуйте ещё раз."
          onRetry={retry}
          visualLabel="Поиск недоступен"
          className="min-h-64 rounded-card bg-surface-elevated"
        />
      )}

      {searchNotice && (
        <div
          role={hasRefreshError && !isUpdating ? 'alert' : 'status'}
          className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-context-border bg-surface-elevated px-4 py-3"
        >
          <p className="text-caption text-text-secondary">{searchNotice}</p>

          {hasRefreshError && !isUpdating && (
            <Button size="small" variant="ghost" onClick={retry}>
              Повторить
            </Button>
          )}
        </div>
      )}

      {status === 'empty' && (
        <EmptyState
          title="Ничего не найдено"
          description={`По запросу «${displayedQuery}» результатов нет.`}
          className="min-h-64 rounded-card bg-surface-elevated"
        />
      )}

      {status === 'success' && results.length > 0 && (
        <div>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-caption font-semibold tracking-wide text-accent-text uppercase">
                Результаты поиска
              </p>

              <h2 className="mt-1 text-heading text-text-primary">«{displayedQuery}»</h2>
            </div>

            <p className="w-fit rounded-full bg-watermark/10 px-3 py-1.5 text-caption text-text-secondary">
              Найдено: {results.length}
            </p>
          </div>

          <MediaGrid virtualized>
            {results.map((media) => (
              <MediaCard
                key={media.mediaRef}
                media={media}
                isFavorite={isFavorite(media.mediaRef)}
                favoriteDisabled={!canUpdateFavorites || isFavoriteUpdating(media.mediaRef)}
                onFavoriteChange={() => toggleFavorite(media.mediaRef)}
              />
            ))}
          </MediaGrid>

          <InfiniteScroll
            key={urlQuery}
            query={pagination}
            disabled={isPreviousResult}
            className="mt-4"
          />
        </div>
      )}
    </section>
  );
}
