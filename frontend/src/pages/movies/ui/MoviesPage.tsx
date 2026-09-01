import type { MediaRef } from '@/entities/media';
import { MediaCatalog } from '@/widgets/media-catalog';
import { useNavigate } from 'react-router';

export function MoviesPage() {
  const navigate = useNavigate();

  const openMedia = (mediaRef: MediaRef) => {
    navigate(`/media/${encodeURIComponent(mediaRef)}`);
  };

  return <MediaCatalog type="movie" title="Фильмы" onOpen={openMedia} />;
}
