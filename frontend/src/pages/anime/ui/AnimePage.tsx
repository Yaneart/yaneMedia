import { demoMediaCatalog, type MediaRef } from '@/entities/media';
import { MediaCatalog } from '@/widgets/media-catalog';
import { useNavigate } from 'react-router';

const demoAnime = demoMediaCatalog.filter((media) => media.type === 'anime');

export function AnimePage() {
  const navigate = useNavigate();

  const openMedia = (mediaRef: MediaRef) => {
    navigate(`/media/${encodeURIComponent(mediaRef)}`);
  };

  return <MediaCatalog title="Аниме" media={demoAnime} onOpen={openMedia} />;
}
