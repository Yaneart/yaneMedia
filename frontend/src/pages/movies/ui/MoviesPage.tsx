import { useNavigate } from 'react-router';
import { useState } from 'react';

import { demoMediaCatalog, MediaCard, type MediaRef } from '@/entities/media';
import { MediaCatalog } from '@/widgets/media-catalog';

const demoMovies = demoMediaCatalog.filter((media) => media.type === 'movie');

export function MoviesPage() {
  const navigate = useNavigate();

  const [favoriteMediaRefs, setFavoriteMediaRefs] = useState<Set<MediaRef>>(() => new Set());
  const [searchValue, setSearchValue] = useState('');

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
    <MediaCatalog title="Фильмы" searchValue={searchValue} onSearchChange={setSearchValue}>
      {demoMovies.map((media) => (
        <MediaCard
          key={media.mediaRef}
          media={media}
          onOpen={() => openMedia(media.mediaRef)}
          isFavorite={favoriteMediaRefs.has(media.mediaRef)}
          onFavoriteChange={() => toggleFavorite(media.mediaRef)}
        />
      ))}
    </MediaCatalog>
  );
}
