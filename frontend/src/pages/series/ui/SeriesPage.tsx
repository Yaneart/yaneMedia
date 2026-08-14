import { demoMediaCatalog, type MediaRef } from '@/entities/media';
import { MediaCatalog } from '@/widgets/media-catalog';
import { useNavigate } from 'react-router';

const demoSeries = demoMediaCatalog.filter((media) => media.type === 'series');

export function SeriesPage() {
  const navigate = useNavigate();

  const openMedia = (mediaRef: MediaRef) => {
    navigate(`/media/${encodeURIComponent(mediaRef)}`);
  };

  return <MediaCatalog title="Сериалы" media={demoSeries} onOpen={openMedia} />;
}
