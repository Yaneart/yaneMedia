import { useNavigate } from 'react-router';

import { demoHomeFeed } from '../model/homeFeed.mock';
import { FeaturedMedia } from '@/widgets/featured-media';
import { ContinueWatchingCard } from '@/widgets/continue-watching-card';
import { ContentRow } from '@/shared';
import { LandscapeMediaCard, type MediaRef } from '@/entities/media';

export function HomePage() {
  const navigate = useNavigate();

  const openMedia = (mediaRef: MediaRef) => {
    navigate(`/media/${encodeURIComponent(mediaRef)}`);
  };
  return (
    <div className="space-y-6">
      <FeaturedMedia
        media={demoHomeFeed.featured}
        onOpen={() => openMedia(demoHomeFeed.featured.mediaRef)}
      />

      <section>
        <h2 className="mb-3 text-heading font-semibold">Продолжить просмотр</h2>

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
  );
}
