import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { useNavigate } from 'react-router';

import { MediaCard, searchMedia, type MediaRef, type MediaSummary } from '@/entities/media';
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

type SearchStatus = 'idle' | 'loading' | 'success' | 'error';

const searchSuggestions = ['Дюна', 'Игра престолов', 'Фрирен'] as const;

export function SearchPage() {
  const navigate = useNavigate();
  const { isFavorite, toggleFavorite } = useFavorites();

  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [results, setResults] = useState<MediaSummary[]>([]);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const activeSearchControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      activeSearchControllerRef.current?.abort();
    };
  }, []);

  const runSearch = async (searchQuery: string) => {
    activeSearchControllerRef.current?.abort();

    const controller = new AbortController();

    activeSearchControllerRef.current = controller;

    setSubmittedQuery(searchQuery);
    setStatus('loading');

    try {
      const nextResult = await searchMedia(searchQuery, { signal: controller.signal });

      if (controller.signal.aborted) {
        return;
      }

      setResults(nextResult);
      setStatus('success');
    } catch {
      if (controller.signal.aborted) {
        return;
      }
      setResults([]);
      setStatus('error');
    } finally {
      if (activeSearchControllerRef.current === controller) {
        activeSearchControllerRef.current = null;
      }
    }
  };

  const startSearch = (searchQuery: string) => {
    setQuery(searchQuery);
    void runSearch(searchQuery);
  };

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      activeSearchControllerRef.current?.abort();
      activeSearchControllerRef.current = null;

      setSubmittedQuery('');
      setResults([]);
      setStatus('idle');
      return;
    }

    void runSearch(normalizedQuery);
  };

  const openMedia = (mediaRef: MediaRef) => {
    navigate(`/media/${encodeURIComponent(mediaRef)}`);
  };

  return (
    <section className="space-y-6" aria-busy={status === 'loading'}>
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

          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
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
              maxLength={100}
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

      {status === 'error' && (
        <ErrorState
          variant="section"
          title="Не удалось выполнить поиск"
          description="Проверьте подключение и попробуйте ещё раз."
          onRetry={() => void runSearch(submittedQuery)}
          visualLabel="Поиск недоступен"
          className="min-h-64 rounded-card bg-surface-elevated"
        />
      )}

      {status === 'success' && results.length === 0 && (
        <EmptyState
          title="Ничего не найдено"
          description={`По запросу «${submittedQuery}» результатов нет.`}
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

              <h2 className="mt-1 text-heading text-text-primary">«{submittedQuery}»</h2>
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
                onOpen={() => openMedia(media.mediaRef)}
                onFavoriteChange={() => toggleFavorite(media.mediaRef)}
              />
            ))}
          </MediaGrid>
        </div>
      )}
    </section>
  );
}
