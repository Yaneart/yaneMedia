import { demoMediaDetails } from '@/entities/media';
import { demoMediaSources } from '@/entities/media-source';
import { FavoriteButton } from '@/features/favorite';
import { SourceSelector } from '@/features/source-selection';
import { ErrorState } from '@/shared';
import { MediaInfo } from '@/widgets/media-info';
import { MediaPlayer, type MediaPlayerStatus } from '@/widgets/media-player';
import { useEffect, useState } from 'react';
import { useParams } from 'react-router';

export function MediaPage() {
  const { mediaRef } = useParams();
  const [isFavorite, setIsFavorite] = useState(false);
  const [selectedSourceRef, setSelectedSourceRef] = useState<string | null>(
    demoMediaSources[0]?.sourceRef ?? null,
  );
  const [isPlayerStarted, setIsPlayerStarted] = useState(false);
  const [playerStatus, setPlayerStatus] = useState<MediaPlayerStatus>('ready');

  const selectedSource = demoMediaSources.find((source) => source.sourceRef === selectedSourceRef);

  const selectSource = (sourceRef: string | null) => {
    setSelectedSourceRef(sourceRef);
    setIsPlayerStarted(false);
    setPlayerStatus('ready');
  };

  const loadPlayer = () => {
    setIsPlayerStarted(true);
    setPlayerStatus('loading');
  };

  useEffect(() => {
    if (!isPlayerStarted || playerStatus !== 'loading') return;

    const readyTimeout = window.setTimeout(() => setPlayerStatus('ready'), 900);

    return () => window.clearTimeout(readyTimeout);
  }, [isPlayerStarted, playerStatus]);

  if (mediaRef !== demoMediaDetails.mediaRef) {
    return (
      <ErrorState
        title="Произведение не найдено"
        description="Для этого произведения пока нет демонстрационных подробных данных."
      />
    );
  }

  return (
    <div className="grid items-start gap-8 2xl:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)] 2xl:gap-10">
      <div className="order-2 overflow-hidden rounded-card border border-context-border bg-surface shadow-surface 2xl:order-none 2xl:col-start-2 2xl:row-start-1">
        <SourceSelector
          sources={demoMediaSources}
          selectedSourceRef={selectedSourceRef}
          onSourceChange={selectSource}
          variant="toolbar"
        />

        <MediaPlayer
          mediaTitle={demoMediaDetails.title}
          backdrop={demoMediaDetails.backdrop}
          source={selectedSource}
          isStarted={isPlayerStarted}
          status={playerStatus}
          onStart={loadPlayer}
          onRetry={loadPlayer}
          embedded
        />
      </div>

      <MediaInfo
        media={demoMediaDetails}
        variant="watch"
        actions={
          <FavoriteButton
            isFavorite={isFavorite}
            onFavoriteChange={setIsFavorite}
            mediaTitle={demoMediaDetails.title}
          />
        }
      />

      {demoMediaDetails.description && (
        <section
          aria-label="Полное описание"
          className="order-3 hidden rounded-card border border-context-border bg-surface-elevated p-6 2xl:col-span-2 2xl:block"
        >
          <h2 className="text-heading text-text-primary">Описание</h2>
          <p className="mt-3 max-w-5xl text-body text-text-secondary">
            {demoMediaDetails.description}
          </p>
        </section>
      )}
    </div>
  );
}
