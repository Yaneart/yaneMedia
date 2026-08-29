import { useNavigate } from 'react-router';

import { LandscapeMediaCard, type MediaRef } from '@/entities/media';
import { FeaturedMedia } from '@/widgets/featured-media';
import { ContinueWatchingCard } from '@/widgets/continue-watching-card';
import { ContentRow, ErrorState, Spinner } from '@/shared';
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
      <div className="-m-page flex min-h-[70vh] items-center justify-center bg-surface">
        <Spinner size="large" label="Загружаем главную" />
      </div>
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
        {featured.backdrop && (
          <img
            key={featured.mediaRef}
            src={featured.backdrop.url}
            alt=""
            width={featured.backdrop.width}
            height={featured.backdrop.height}
            className={[
              'absolute inset-0 -z-20 size-full object-cover',
              'object-[61%_center] md:object-center',
            ].join(' ')}
          />
        )}

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
            </ContentRow>
          </section>
        ))}
      </div>
    </div>
  );
}
