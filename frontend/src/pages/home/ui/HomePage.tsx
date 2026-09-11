import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import { useState } from 'react';

import {
  MediaLandscapeArtwork,
  MediaCard,
  mediaSummaryResolutionQueryKey,
  useMediaSummaryResolution,
  type MediaRef,
} from '@/entities/media';
import { useFavorites } from '@/features/favorite';
import { usePlaybackSession } from '@/features/playback-session';
import { RestorableContentRow } from '@/features/scroll-restoration';
import { FeaturedMedia } from '@/widgets/featured-media';
import { ContinueWatchingCard } from '@/widgets/continue-watching-card';
import { EmptyState, ErrorState, LoadingState, Skeleton, YaneMark } from '@/shared';
import { useHomeFeed } from '../model/useHomeFeed';
import { HomeCollectionsSkeleton } from './HomeCollectionsSkeleton';

export function HomePage() {
  const queryClient = useQueryClient();
  const {
    featured,
    isFeaturedError,
    isFeaturedPaused,
    retryFeatured,
    collections,
    areCollectionsLoading,
    areCollectionsPaused,
    areMoreCollectionsLoading,
    isCollectionsError,
    retryCollections,
  } = useHomeFeed();
  const [continueWatchingAnnouncement, setContinueWatchingAnnouncement] = useState('');
  const { isFavorite, toggleFavorite } = useFavorites();
  const { continueWatchingEntries, restoreSession, removeContinueWatchingEntry } =
    usePlaybackSession();
  const {
    resolution: continueWatchingResolution,
    status: continueWatchingResolutionStatus,
    retry: retryContinueWatchingResolution,
  } = useMediaSummaryResolution(continueWatchingEntries.map((entry) => entry.mediaRef));

  const continueWatchingMediaByRef = new Map(
    continueWatchingResolution?.items.map((media) => [media.mediaRef, media]),
  );
  const resolvedContinueWatchingEntries = continueWatchingEntries.flatMap((entry) => {
    const media = continueWatchingMediaByRef.get(entry.mediaRef);

    return media ? [{ entry, media }] : [];
  });

  const removeFromContinueWatching = (mediaRef: MediaRef, title: string) => {
    const remainingMediaRefs = continueWatchingEntries
      .filter((entry) => entry.mediaRef !== mediaRef)
      .map((entry) => entry.mediaRef);
    const remainingMedia = remainingMediaRefs.flatMap((remainingMediaRef) => {
      const media = continueWatchingMediaByRef.get(remainingMediaRef);

      return media ? [media] : [];
    });

    if (
      continueWatchingResolution &&
      remainingMediaRefs.length > 0 &&
      remainingMedia.length === remainingMediaRefs.length
    ) {
      queryClient.setQueryData(mediaSummaryResolutionQueryKey(remainingMediaRefs), {
        ...continueWatchingResolution,
        items: remainingMedia,
      });
    }

    removeContinueWatchingEntry(mediaRef);
    setContinueWatchingAnnouncement(`«${title}» убрано из продолжения просмотра.`);
  };

  return (
    <div className="-m-page bg-surface">
      {featured ? (
        <section className="relative isolate min-h-[500px] overflow-hidden bg-elevated md:min-h-[clamp(32rem,62vh,43rem)]">
          <div className="absolute inset-0 -z-20">
            <MediaLandscapeArtwork
              key={featured.mediaRef}
              media={featured}
              variant="hero"
              backdropClassName="object-[61%_center] md:object-center"
            />
          </div>

          <div className="home-hero-overlay absolute inset-0 -z-10" />
          <div
            className={[
              'absolute inset-x-0 bottom-0 -z-10 h-28',
              'bg-linear-to-b from-transparent via-surface/45 to-surface',
              'md:h-36',
            ].join(' ')}
          />

          <div className="relative flex min-h-[500px] items-end px-5 pt-28 pb-14 md:min-h-[clamp(32rem,62vh,43rem)] md:px-page md:pt-32 md:pb-20">
            <FeaturedMedia media={featured} />
          </div>
        </section>
      ) : isFeaturedPaused ? (
        <EmptyState
          role="status"
          title="Нет подключения к сети"
          description="Загрузим главную, когда соединение восстановится."
          className="min-h-[500px] bg-elevated md:min-h-[clamp(32rem,62vh,43rem)]"
        />
      ) : isFeaturedError ? (
        <ErrorState
          variant="page"
          eyebrow="Главная вне сигнала"
          title="Не удалось загрузить главную"
          description="Медиатека временно не отвечает. Проверьте подключение и попробуйте восстановить сигнал."
          visualLabel="Лента недоступна"
          retryLabel="Восстановить сигнал"
          onRetry={retryFeatured}
          className="min-h-[500px] bg-elevated px-page md:min-h-[clamp(32rem,62vh,43rem)]"
        />
      ) : (
        <LoadingState
          variant="page"
          label="Загружаем главную"
          className="min-h-[500px] bg-elevated md:min-h-[clamp(32rem,62vh,43rem)]"
        />
      )}

      <div className="space-y-10 px-page py-8 md:space-y-12 md:py-10">
        <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {continueWatchingAnnouncement}
        </p>

        {continueWatchingEntries.length > 0 && (
          <section>
            <h2 className="mb-4 text-heading font-semibold text-text-primary">
              Продолжить просмотр
            </h2>

            {continueWatchingResolutionStatus === 'loading' ? (
              <RestorableContentRow
                scrollKey="continue-watching"
                variant="continuation"
                aria-label="Загружаем продолжение просмотра"
              >
                {continueWatchingEntries.map((entry) => (
                  <Skeleton key={entry.mediaRef} className="aspect-[2.35/1] w-full rounded-card" />
                ))}
              </RestorableContentRow>
            ) : resolvedContinueWatchingEntries.length > 0 ? (
              <RestorableContentRow scrollKey="continue-watching" variant="continuation">
                {resolvedContinueWatchingEntries.map(({ entry, media }) => (
                  <ContinueWatchingCard
                    key={entry.mediaRef}
                    media={media}
                    progress={{
                      positionSeconds: entry.positionSeconds,
                      durationSeconds: entry.durationSeconds,
                      updatedAt: entry.updatedAt,
                    }}
                    episode={entry.episode}
                    onContinue={() => restoreSession(entry.mediaRef)}
                    onRemove={() => removeFromContinueWatching(entry.mediaRef, media.title)}
                  />
                ))}
              </RestorableContentRow>
            ) : (
              <ErrorState
                title="Не удалось восстановить продолжение просмотра"
                description="Прогресс сохранён на этом устройстве. Попробуйте загрузить сведения о произведениях ещё раз."
                retryLabel="Повторить"
                onRetry={retryContinueWatchingResolution}
              />
            )}
          </section>
        )}

        {collections.map((collection) => (
          <section key={collection.id}>
            <h2 className="mb-4 text-heading font-semibold">{collection.title}</h2>

            <RestorableContentRow scrollKey={collection.id} variant="collection">
              {collection.items.map((media) => (
                <MediaCard
                  key={media.mediaRef}
                  media={media}
                  isFavorite={isFavorite(media.mediaRef)}
                  onFavoriteChange={() => toggleFavorite(media.mediaRef)}
                />
              ))}

              {collection.id === 'home-editorial-picks' &&
                collection.total > collection.items.length && (
                  <Link
                    to="/collections/editorial-picks"
                    aria-label={`Открыть все ${collection.total} произведений из выбора редакции`}
                    className={[
                      'group relative aspect-2/3 w-full overflow-hidden rounded-card',
                      'border border-context-border bg-linear-to-br',
                      'from-watermark/35 via-watermark/15 to-surface-elevated text-left',
                      'transition-[transform,border-color] duration-200 ease-out',
                      'hover:border-watermark/60 active:scale-[0.992]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action',
                    ].join(' ')}
                  >
                    <YaneMark
                      aria-hidden="true"
                      className="absolute -top-12 -right-10 h-[150%] w-[75%] rotate-12 text-watermark/45 transition-transform duration-300 group-hover:scale-105"
                    />

                    <div className="relative flex size-full flex-col justify-end bg-linear-to-t from-black/70 via-black/10 to-transparent p-4 text-white">
                      <span className="text-caption text-white/65">Редакционная коллекция</span>
                      <span className="mt-1 text-lg font-semibold">
                        Все {collection.total} произведений
                      </span>
                      <span className="mt-2 text-caption font-semibold text-white/85">
                        Показать подборку →
                      </span>
                    </div>
                  </Link>
                )}
            </RestorableContentRow>
          </section>
        ))}

        {areCollectionsLoading && <HomeCollectionsSkeleton rows={2} />}

        {areCollectionsPaused && (
          <EmptyState
            role="status"
            title="Нет подключения к сети"
            description="Подборки появятся после восстановления соединения."
            className="min-h-64 rounded-card bg-surface-elevated"
          />
        )}

        {isCollectionsError && (
          <ErrorState
            variant="section"
            title="Не удалось загрузить подборки"
            description="Попробуйте восстановить подборки ещё раз. Hero и локальный прогресс продолжат работать отдельно."
            retryLabel="Повторить"
            onRetry={retryCollections}
            className="min-h-64 rounded-card bg-surface-elevated"
          />
        )}

        {areMoreCollectionsLoading && collections.length > 0 && <HomeCollectionsSkeleton />}
      </div>
    </div>
  );
}
