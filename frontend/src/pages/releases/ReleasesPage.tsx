import { useInfiniteQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router';
import { mapMediaSummary, MediaCard, type MediaType } from '@/entities/media';
import type { MediaSummaryDto } from '@/entities/media/api/mediaSummaryDto';
import { useFavorites } from '@/features/favorite';
import { apiRequest } from '@/shared/api/apiClient';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  LoadMoreButton,
  MediaGrid,
  YaneMark,
  MoviesIcon,
  SeriesIcon,
  AnimeIcon,
  type IconProps,
} from '@/shared';
import type { ComponentType } from 'react';
import { ReleasePosterOverlay } from './ReleasePosterOverlay';

type ReleaseDto = MediaSummaryDto & {
  releaseDate?: string;
  nextEpisodeAt?: string;
  ongoing?: boolean;
};
type ReleasePage = { items: ReleaseDto[]; hasMore: boolean; partial: boolean };
const categories: { value: MediaType; label: string; icon: ComponentType<IconProps> }[] = [
  { value: 'movie', label: 'Фильмы', icon: MoviesIcon },
  { value: 'series', label: 'Сериалы', icon: SeriesIcon },
  { value: 'anime', label: 'Аниме', icon: AnimeIcon },
];

export function ReleasesPage() {
  const [params, setParams] = useSearchParams();
  const type =
    categories.find((category) => category.value === params.get('type'))?.value ?? 'movie';
  const period = params.get('period') === 'upcoming' ? 'upcoming' : 'recent';
  const favorites = useFavorites();
  const query = useInfiniteQuery({
    queryKey: ['releases', type, period],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      apiRequest<ReleasePage>(`/media/releases?type=${type}&period=${period}&page=${pageParam}`, {
        signal,
      }),
    getNextPageParam: (last, _pages, page) => (last.hasMore ? page + 1 : undefined),
    staleTime: 5 * 60_000,
  });
  const items = [
    ...new Map(
      query.data?.pages.flatMap((page) => page.items).map((item) => [item.mediaRef, item]) ?? [],
    ).values(),
  ];
  const update = (nextType: MediaType, nextPeriod: string) =>
    setParams({ type: nextType, period: nextPeriod });

  return (
    <section>
      <header className="relative isolate overflow-hidden pt-2 sm:pt-5">
        <YaneMark className="pointer-events-none absolute -top-14 -right-8 -z-10 size-72 -rotate-12 text-watermark opacity-[0.07] sm:right-8 sm:size-96" />
        <div className="max-w-2xl py-4 sm:py-6">
          <p className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.22em] text-accent-text uppercase">
            <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />В центре
            внимания
          </p>
          <h1
            data-page-heading
            tabIndex={-1}
            className="mt-3 text-4xl font-semibold tracking-tight text-text-primary sm:text-5xl"
          >
            Новинки<span className="text-accent-text">.</span>
          </h1>
          <p className="mt-3 max-w-lg text-body leading-relaxed text-text-secondary sm:text-lg">
            Свежие истории, любимые продолжения и премьеры, которых стоит ждать.
          </p>
        </div>
        <div className="mt-4 flex flex-col gap-4 border-b border-context-border sm:mt-6 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
          <div role="group" aria-label="Категория" className="flex gap-5 sm:gap-8">
            {categories.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                variant="bare"
                size="custom"
                aria-pressed={type === value}
                onClick={() => update(value, period)}
                className={`relative min-h-12 rounded-none px-0 pb-3 text-sm sm:text-base ${type === value ? 'text-text-primary after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-action' : 'text-text-secondary hover:text-text-primary'}`}
              >
                <Icon aria-hidden="true" className="size-4 sm:size-5" />
                {label}
              </Button>
            ))}
          </div>
          <div
            role="group"
            aria-label="Период выхода"
            className="mb-3 flex w-fit rounded-full border border-context-border bg-surface-elevated p-1"
          >
            {[
              { value: 'recent', label: 'Сейчас' },
              { value: 'upcoming', label: 'Скоро' },
            ].map((option) => (
              <Button
                key={option.value}
                variant="bare"
                size="custom"
                aria-pressed={period === option.value}
                onClick={() => update(type, option.value)}
                className={`min-h-9 rounded-full px-5 text-caption ${period === option.value ? 'bg-action text-action-text shadow-sm' : 'text-text-secondary hover:text-text-primary'}`}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </header>
      <div className="mt-6 sm:mt-8" aria-busy={query.isFetching}>
        {!query.data ? (
          query.isError ? (
            <ErrorState title="Не удалось загрузить новинки" onRetry={() => void query.refetch()} />
          ) : query.isPaused ? (
            <EmptyState
              title="Нет подключения к сети"
              description="Загрузим новинки, когда соединение восстановится."
            />
          ) : (
            <LoadingState label="Загружаем новинки" />
          )
        ) : (
          <>
            {(query.isRefetchError || query.data.pages.some((page) => page.partial)) && (
              <p role="status" className="mb-5 text-caption text-text-secondary">
                {query.isRefetchError
                  ? 'Не удалось обновить список. Показана сохранённая версия.'
                  : 'Часть данных о релизах временно недоступна.'}
              </p>
            )}
            {items.length ? (
              <MediaGrid key={`${type}:${period}`} virtualized>
                {items.map((item) => (
                  <MediaCard
                    key={item.mediaRef}
                    media={mapMediaSummary(item)}
                    isFavorite={favorites.isFavorite(item.mediaRef)}
                    favoriteDisabled={
                      !favorites.canUpdateFavorites || favorites.isFavoriteUpdating(item.mediaRef)
                    }
                    onFavoriteChange={() => favorites.toggleFavorite(item.mediaRef)}
                    posterOverlay={
                      <ReleasePosterOverlay
                        upcoming={period === 'upcoming'}
                        releaseDate={item.releaseDate}
                        nextEpisodeAt={item.nextEpisodeAt}
                        ongoing={item.ongoing}
                      />
                    }
                  />
                ))}
              </MediaGrid>
            ) : (
              <EmptyState
                title="Пока ничего нового"
                description={
                  query.hasNextPage
                    ? 'В этой части подборки нет релизов с русским названием. Посмотрите дальше.'
                    : 'Загляните чуть позже — новые истории уже на подходе.'
                }
              />
            )}
            {(query.hasNextPage || query.isFetchNextPageError) && (
              <div className="mt-8 flex flex-col items-center gap-3">
                {query.isFetchNextPageError && (
                  <p role="alert" className="text-caption text-danger">
                    Не удалось загрузить следующую страницу.
                  </p>
                )}
                <LoadMoreButton
                  isLoading={query.isFetchingNextPage}
                  hasError={query.isFetchNextPageError}
                  disabled={query.isFetching || query.isPaused}
                  onClick={() => void query.fetchNextPage({ cancelRefetch: false })}
                />
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
