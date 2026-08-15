import { useNavigate } from 'react-router';

import { demoFeaturedCandidates, demoHomeFeed } from '../model/homeFeed.mock';
import { useHourlyFeatured } from '../model/useHourlyFeatured';
import { FeaturedMedia } from '@/widgets/featured-media';
import { ContinueWatchingCard } from '@/widgets/continue-watching-card';
import { ContentRow, SearchInput } from '@/shared';
import { LandscapeMediaCard, type MediaRef } from '@/entities/media';

export function HomePage() {
  const navigate = useNavigate();
  const featured = useHourlyFeatured(demoFeaturedCandidates) ?? demoHomeFeed.featured;

  const openMedia = (mediaRef: MediaRef) => {
    navigate(`/media/${encodeURIComponent(mediaRef)}`);
  };
  return (
    <div className="-m-page">
      <section className="relative isolate overflow-hidden bg-elevated">
        {featured.backdrop && (
          <img
            key={featured.mediaRef}
            src={featured.backdrop.url}
            alt=""
            width={featured.backdrop.width}
            height={featured.backdrop.height}
            className={[
              'absolute inset-x-0 top-0 -z-20 h-[420px] w-full object-cover',
              'object-[58%_center] md:inset-0 md:h-full md:object-center',
            ].join(' ')}
          />
        )}

        <div className="absolute inset-x-0 top-0 -z-10 h-[420px] bg-gradient-to-r from-black/85 via-black/40 to-transparent md:inset-0 md:h-full" />
        <div className="absolute inset-x-0 top-0 -z-10 h-[420px] bg-gradient-to-t from-black/85 via-black/15 to-transparent md:inset-0 md:h-full" />
        <div
          className={[
            'absolute inset-x-0 top-[300px] -z-10 h-[120px]',
            'bg-linear-to-b from-transparent via-surface/35 to-surface',
            'md:top-auto md:bottom-0 md:h-[32%]',
          ].join(' ')}
        />

        <header className="absolute left-10 top-8 z-10 hidden md:block">
          <h1 className="text-title font-semibold text-white">Добрый вечер</h1>

          <div className="mt-4 w-md">
            <SearchInput
              aria-label="Поиск фильмов, сериалов и аниме"
              placeholder="Что будем смотреть?"
              className={[
                'border-white/25! bg-black/35!',
                'text-white placeholder:text-white/60',
                'hover:border-white/40! hover:bg-black/45!',
                'focus:border-white/45! focus:bg-black/45!',
                'focus-visible:outline-none',
                'focus-visible:ring-2 focus-visible:ring-white/25',
              ].join(' ')}
            />
          </div>
        </header>

        <div className="relative md:px-page md:pt-56">
          <FeaturedMedia media={featured} onOpen={() => openMedia(featured.mediaRef)} />
        </div>

        <section className="relative px-5 pb-8 md:mt-10 md:px-page md:pb-page">
          <h2 className="mb-3 text-heading font-semibold text-text-primary md:text-white">
            Продолжить просмотр
          </h2>

          <ContentRow>
            {demoHomeFeed.continueWatching.map((item) => (
              <ContinueWatchingCard
                key={item.media.mediaRef}
                media={item.media}
                progress={item.progress}
                onOpen={() => openMedia(item.media.mediaRef)}
              />
            ))}
          </ContentRow>
        </section>
      </section>

      <div className="space-y-6 px-page pt-6 pb-page">
        {demoHomeFeed.collections.slice(0, 1).map((collection) => (
          <section key={collection.id}>
            <h2 className="mb-3 text-heading font-semibold">{collection.title}</h2>

            <ContentRow>
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
