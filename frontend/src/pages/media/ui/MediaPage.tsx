import { demoMediaDetailsCatalog } from '@/entities/media';
import { useOpeningHistory } from '@/features/opening-history';
import { ErrorState } from '@/shared';
import { useEffect } from 'react';
import { useParams } from 'react-router';
import { MediaView } from './MediaView';

export function MediaPage() {
  const { mediaRef } = useParams();
  const { recordOpening } = useOpeningHistory();
  const media = demoMediaDetailsCatalog.find((item) => item.mediaRef === mediaRef);

  useEffect(() => {
    if (!media) {
      return;
    }

    recordOpening(media.mediaRef);
  }, [media, recordOpening]);

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
