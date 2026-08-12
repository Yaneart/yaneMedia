import { useNavigate } from 'react-router';

import { demoMediaCatalog, MediaCard, type MediaRef } from '@/entities/media';

const demoMovies = demoMediaCatalog.filter((media) => media.type === 'movie');

export function MoviesPage() {
  const navigate = useNavigate();

  const openMedia = (mediaRef: MediaRef) => {
    navigate(`/media/${encodeURIComponent(mediaRef)}`);
  };

  return (
    <section>
      <h1 className="mb-6 text-title font-semibold">Фильмы</h1>

      <div className="grid grid-cols-2 gap-x-4 gap-y-6 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        {demoMovies.map((media) => (
          <MediaCard key={media.mediaRef} media={media} onOpen={() => openMedia(media.mediaRef)} />
        ))}
      </div>
    </section>
  );
}
