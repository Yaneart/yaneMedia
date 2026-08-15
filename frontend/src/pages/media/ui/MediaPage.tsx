import { demoMediaDetailsCatalog } from '@/entities/media';
import { ErrorState } from '@/shared';
import { useParams } from 'react-router';
import { MediaView } from './MediaView';

export function MediaPage() {
  const { mediaRef } = useParams();
  const media = demoMediaDetailsCatalog.find((item) => item.mediaRef === mediaRef);

  if (!media) {
    return (
      <ErrorState
        title="Произведение не найдено"
        description="Для этого произведения пока нет демонстрационных подробных данных."
      />
    );
  }

  return <MediaView key={media.mediaRef} media={media} />;
}
