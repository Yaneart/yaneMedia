import type { MediaRef } from '@/entities/media';
import { MediaCatalog } from '@/widgets/media-catalog';
import { useNavigate } from 'react-router';

export function SeriesPage() {
  const navigate = useNavigate();

  const openMedia = (mediaRef: MediaRef) => {
    navigate(`/media/${encodeURIComponent(mediaRef)}`);
  };

  return <MediaCatalog type="series" title="Сериалы" onOpen={openMedia} />;
}
