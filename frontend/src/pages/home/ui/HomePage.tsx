import { useNavigate } from 'react-router';

import { demoHomeFeed } from '../model/homeFeed.mock';
import { FeaturedMedia } from '@/widgets/featured-media';
import { ContinueWatchingCard } from '@/widgets/continue-watching-card';
import { ContentRow } from '@/shared';
import type { MediaRef } from '@/entities/media';

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
    </div>
  );
}
