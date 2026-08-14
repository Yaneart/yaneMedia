import { demoMediaCatalog, type MediaRef } from '@/entities/media';
import { MediaCatalog } from '@/widgets/media-catalog';
import { useNavigate } from 'react-router';

const demoMovies = demoMediaCatalog.filter((media) => media.type === 'movie');

export function MoviesPage() {
  const navigate = useNavigate();

  const openMedia = (mediaRef: MediaRef) => {
    navigate(`/media/${encodeURIComponent(mediaRef)}`);
  };

  return <MediaCatalog title="Фильмы" media={demoMovies} onOpen={openMedia} />;
}
