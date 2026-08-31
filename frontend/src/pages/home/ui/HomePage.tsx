import { useNavigate } from 'react-router';

import { LandscapeMediaCard, MediaLandscapeArtwork, type MediaRef } from '@/entities/media';
import { FeaturedMedia } from '@/widgets/featured-media';
import { ContinueWatchingCard } from '@/widgets/continue-watching-card';
import { ContentRow, ErrorState, LoadingState, YaneMark } from '@/shared';
import { useHomeFeed } from '../model/useHomeFeed';

export function HomePage() {
  const navigate = useNavigate();
  const { feed, status, retry } = useHomeFeed();

  if (!feed && status === 'error') {
    return (
      <ErrorState
        variant="page"
        eyebrow="Главная вне сигнала"
        title="Не удалось загрузить главную"
        description="Медиатека временно не отвечает. Проверьте подключение и попробуйте восстановить сигнал."
        visualLabel="Лента недоступна"
        retryLabel="Восстановить сигнал"
        onRetry={retry}
        className="-m-page min-h-[70vh] bg-surface px-page"
      />
    );
  }

  if (!feed) {
    return (
      <LoadingState
        variant="page"
        label="Загружаем главную"
        className="-m-page min-h-[70vh] bg-surface px-page"
      />
    );
  }

  const featured = feed.featured;
  const continueWatching = feed.continueWatching.filter(
    (item) => item.media.mediaRef !== featured.mediaRef,
  );

  const openMedia = (mediaRef: MediaRef) => {
    navigate(`/media/${encodeURIComponent(mediaRef)}`);
  };
  return (
    <div className="-m-page bg-surface">
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
          <FeaturedMedia media={featured} onOpen={() => openMedia(featured.mediaRef)} />
        </div>
      </section>

      <div className="space-y-10 px-page py-8 md:space-y-12 md:py-10">
        <section>
          <h2 className="mb-4 text-heading font-semibold text-text-primary">Продолжить просмотр</h2>

          <ContentRow variant="continuation">
            {continueWatching.map((item) => (
              <ContinueWatchingCard
                key={item.media.mediaRef}
                media={item.media}
                progress={item.progress}
                onOpen={() => openMedia(item.media.mediaRef)}
              />
            ))}
          </ContentRow>
        </section>

        {feed.collections.map((collection) => (
          <section key={collection.id}>
            <h2 className="mb-4 text-heading font-semibold">{collection.title}</h2>

            <ContentRow variant="collection">
              {collection.items.map((media) => (
                <LandscapeMediaCard
                  key={media.mediaRef}
                  media={media}
                  onOpen={() => openMedia(media.mediaRef)}
                />
              ))}

              {collection.id === 'editorial-picks' &&
                collection.total > collection.items.length && (
                  <button
                    type="button"
                    aria-label={`Открыть все ${collection.total} произведений из выбора редакции`}
                    className={[
                      'group relative aspect-video w-full overflow-hidden rounded-card',
                      'border border-context-border bg-linear-to-br',
                      'from-watermark/35 via-watermark/15 to-surface-elevated text-left',
                      'transition-[transform,border-color] duration-200 ease-out',
                      'hover:border-watermark/60 active:scale-[0.992]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action',
                    ].join(' ')}
                    onClick={() => navigate('/collections/editorial-picks')}
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
                  </button>
                )}
            </ContentRow>
          </section>
        ))}
      </div>
    </div>
  );
}
