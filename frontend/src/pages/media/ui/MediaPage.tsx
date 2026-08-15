import { demoMediaDetails } from '@/entities/media';
import { ErrorState } from '@/shared';
import { MediaInfo } from '@/widgets/media-info';
import { useParams } from 'react-router';

export function MediaPage() {
  const { mediaRef } = useParams();

  if (mediaRef !== demoMediaDetails.mediaRef) {
    return (
      <ErrorState
        title="Произведение не найдено"
        description="Для этого произведения пока нет демонстрационных подробных данных."
      />
    );
  }

  return <MediaInfo media={demoMediaDetails} />;
}
