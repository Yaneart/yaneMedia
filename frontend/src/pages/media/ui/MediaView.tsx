import type { MediaDetails } from '@/entities/media';
import { demoMediaSources } from '@/entities/media-source';
import { FavoriteButton } from '@/features/favorite';
import { SeasonSelector } from '@/features/season-selection';
import { SourceSelector } from '@/features/source-selection';
import { MediaInfo } from '@/widgets/media-info';
import { MediaPlayer, type MediaPlayerStatus } from '@/widgets/media-player';
import { useEffect, useState } from 'react';

export type MediaViewProps = {
  media: MediaDetails;
};

export function MediaView({ media }: MediaViewProps) {
  const [isFavorite, setIsFavorite] = useState(false);
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState<number | null>(
    media.type === 'series' ? (media.seasons[0]?.number ?? null) : null,
  );
  const [selectedSourceRef, setSelectedSourceRef] = useState<string | null>(
    demoMediaSources[0]?.sourceRef ?? null,
  );
  const [isPlayerStarted, setIsPlayerStarted] = useState(false);
  const [playerStatus, setPlayerStatus] = useState<MediaPlayerStatus>('ready');

  const selectedSource = demoMediaSources.find((source) => source.sourceRef === selectedSourceRef);

  const resetPlayer = () => {
    setIsPlayerStarted(false);
    setPlayerStatus('ready');
  };

  const selectSource = (sourceRef: string | null) => {
    setSelectedSourceRef(sourceRef);
    resetPlayer();
  };

  const selectSeason = (seasonNumber: number) => {
    setSelectedSeasonNumber(seasonNumber);
    resetPlayer();
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

  return (
    <div className="grid items-start gap-8 2xl:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)] 2xl:gap-10">
      <div className="order-2 overflow-hidden rounded-card border border-context-border bg-surface shadow-surface 2xl:order-none 2xl:col-start-2 2xl:row-start-1">
        <div className="flex flex-col gap-3 bg-surface-elevated px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:gap-5">
          {media.type === 'series' && (
            <SeasonSelector
              seasons={media.seasons}
              selectedSeasonNumber={selectedSeasonNumber}
              onSeasonChange={selectSeason}
              variant="inline"
            />
          )}

          <SourceSelector
            sources={demoMediaSources}
            selectedSourceRef={selectedSourceRef}
            onSourceChange={selectSource}
            variant="inline"
          />
        </div>

        <MediaPlayer
          mediaTitle={media.title}
          backdrop={media.backdrop}
          source={selectedSource}
          isStarted={isPlayerStarted}
          status={playerStatus}
          onStart={loadPlayer}
          onRetry={loadPlayer}
          embedded
        />
      </div>

      <MediaInfo
        media={media}
        variant="watch"
        actions={
          <FavoriteButton
            isFavorite={isFavorite}
            onFavoriteChange={setIsFavorite}
            mediaTitle={media.title}
          />
        }
      />

      {media.description && (
        <section
          aria-label="Полное описание"
          className="order-3 hidden rounded-card border border-context-border bg-surface-elevated p-6 2xl:col-span-2 2xl:block"
        >
          <h2 className="text-heading text-text-primary">Описание</h2>
          <p className="mt-3 max-w-5xl text-body text-text-secondary">{media.description}</p>
        </section>
      )}
    </div>
  );
}
