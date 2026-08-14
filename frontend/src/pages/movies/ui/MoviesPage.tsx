import { useNavigate } from 'react-router';

import { demoMediaCatalog, MediaCard, type MediaRef } from '@/entities/media';
import { useState } from 'react';
import { MediaGrid } from '@/shared';

const demoMovies = demoMediaCatalog.filter((media) => media.type === 'movie');

export function MoviesPage() {
  const navigate = useNavigate();

  const [favoriteMediaRefs, setFavoriteMediaRefs] = useState<Set<MediaRef>>(() => new Set());

  const toggleFavorite = (mediaRef: MediaRef) => {
    setFavoriteMediaRefs((current) => {
      const next = new Set(current);

      if (next.has(mediaRef)) {
        next.delete(mediaRef);
      } else {
        next.add(mediaRef);
      }

      return next;
    });
  };

  const openMedia = (mediaRef: MediaRef) => {
    navigate(`/media/${encodeURIComponent(mediaRef)}`);
  };

  return (
    <section>
      <h1 className="mb-6 text-title font-semibold">Фильмы</h1>

      <MediaGrid>
        {demoMovies.map((media) => (
          <MediaCard
            key={media.mediaRef}
            media={media}
            onOpen={() => openMedia(media.mediaRef)}
            isFavorite={favoriteMediaRefs.has(media.mediaRef)}
            onFavoriteChange={() => toggleFavorite(media.mediaRef)}
          />
        ))}
      </MediaGrid>
    </section>
  );
}
