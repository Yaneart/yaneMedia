import { useEffect, useState, type SubmitEvent } from 'react';
import { useSearchParams } from 'react-router';

import {
  maximumMediaSearchQueryLength,
  MediaCard,
  normalizeMediaSearchQuery,
  useMediaSearch,
} from '@/entities/media';
import { useFavorites } from '@/features/favorite';
import {
  Button,
  EmptyState,
  ErrorState,
  MediaGrid,
  SearchInput,
  LoadingState,
  YaneMark,
} from '@/shared';

const searchSuggestions = ['Дюна', 'Игра престолов', 'Фрирен'] as const;

export function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { isFavorite, toggleFavorite } = useFavorites();

  const submittedQuery = normalizeMediaSearchQuery(searchParams.get('q'));
  const [query, setQuery] = useState(submittedQuery);
  const {
    items: results,
    resultFilters,
    status,
    isPreviousResult,
    isUpdating,
    hasRefreshError,
    retry,
  } = useMediaSearch({ query: submittedQuery }, 0);

  useEffect(() => {
    const canonicalParams = new URLSearchParams();

    if (submittedQuery) canonicalParams.set('q', submittedQuery);

    if (canonicalParams.toString() !== searchParams.toString()) {
      setSearchParams(canonicalParams, { replace: true });
    }
  }, [searchParams, setSearchParams, submittedQuery]);

  useEffect(() => {
    setQuery(submittedQuery);
  }, [submittedQuery]);

  const startSearch = (searchQuery: string) => {
    setQuery(searchQuery);
    setSearchParams({ q: searchQuery });
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      setSearchParams({});
      return;
    }

    if (normalizedQuery === submittedQuery) {
      retry();
      return;
    }

    setSearchParams({ q: normalizedQuery });
  };

  const displayedQuery = resultFilters?.query ?? submittedQuery;
  const searchNotice = hasRefreshError
    ? 'Не удалось обновить результаты. Показана сохранённая выдача.'
    : isUpdating && resultFilters
      ? isPreviousResult
        ? `Ищем «${submittedQuery}». Пока показаны результаты по запросу «${resultFilters.query}».`
        : 'Обновляем результаты поиска…'
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
          'relative overflow-hidden rounded-card',
          'bg-linear-to-br from-watermark/20 via-surface-elevated to-surface-elevated',
          'px-5 py-6 shadow-sm sm:px-7 sm:py-7',
          'lg:grid lg:grid-cols-[minmax(18rem,0.75fr)_minmax(28rem,1.25fr)]',
          'lg:items-center lg:gap-10 lg:px-10 lg:py-8',
        ].join(' ')}
      >
        <YaneMark
          className={[
            'pointer-events-none absolute -top-20 -right-12 hidden size-80 rotate-12',
            'text-watermark opacity-watermark sm:block',
          ].join(' ')}
        />

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
          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleSubmit}>
            <SearchInput
              aria-label="Название произведения"
              value={query}
              maxLength={maximumMediaSearchQueryLength}
              placeholder="Введите название"
              onChange={(event) => setQuery(event.currentTarget.value)}
            />

            <Button
              type="submit"
              disabled={!query.trim()}
              className="w-full shrink-0 sm:w-auto sm:min-w-28"
            >
              Найти
            </Button>
          </form>

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
      </header>

      {status === 'loading' && <LoadingState label={`Поиск: ${submittedQuery}`} />}

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
          role={hasRefreshError ? 'alert' : 'status'}
          className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-context-border bg-surface-elevated px-4 py-3"
        >
          <p className="text-caption text-text-secondary">{searchNotice}</p>

          {hasRefreshError && (
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

          <MediaGrid>
            {results.map((media) => (
              <MediaCard
                key={media.mediaRef}
                media={media}
                isFavorite={isFavorite(media.mediaRef)}
                onFavoriteChange={() => toggleFavorite(media.mediaRef)}
              />
            ))}
          </MediaGrid>
        </div>
      )}
    </section>
  );
}
