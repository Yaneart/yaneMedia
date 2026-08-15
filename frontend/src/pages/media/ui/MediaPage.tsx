import { demoMediaDetails } from '@/entities/media';
import { FavoriteButton } from '@/features/favorite';
import { ErrorState } from '@/shared';
import { MediaInfo } from '@/widgets/media-info';
import { useState } from 'react';
import { useParams } from 'react-router';

export function MediaPage() {
  const { mediaRef } = useParams();
  const [isFavorite, setIsFavorite] = useState(false);

  if (mediaRef !== demoMediaDetails.mediaRef) {
    return (
      <ErrorState
        title="Произведение не найдено"
        description="Для этого произведения пока нет демонстрационных подробных данных."
      />
    );
  }

  return (
    <MediaInfo
      media={demoMediaDetails}
      actions={
        <FavoriteButton
          isFavorite={isFavorite}
          onFavoriteChange={setIsFavorite}
          mediaTitle={demoMediaDetails.title}
        />
      }
    />
  );
}
