import { demoMediaDetails } from '@/entities/media';
import { demoMediaSources } from '@/entities/media-source';
import { FavoriteButton } from '@/features/favorite';
import { SourceSelector } from '@/features/source-selection';
import { ErrorState } from '@/shared';
import { MediaInfo } from '@/widgets/media-info';
import { useState } from 'react';
import { useParams } from 'react-router';

export function MediaPage() {
  const { mediaRef } = useParams();
  const [isFavorite, setIsFavorite] = useState(false);
  const [selectedSourceRef, setSelectedSourceRef] = useState<string | null>(
    demoMediaSources[0]?.sourceRef ?? null,
  );

  if (mediaRef !== demoMediaDetails.mediaRef) {
    return (
      <ErrorState
        title="Произведение не найдено"
        description="Для этого произведения пока нет демонстрационных подробных данных."
      />
    );
  }

  return (
    <div className="space-y-8">
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

      <SourceSelector
        sources={demoMediaSources}
        selectedSourceRef={selectedSourceRef}
        onSourceChange={setSelectedSourceRef}
      />
    </div>
  );
}
