import type { MediaDetails } from '@/entities/media';
import { demoMediaSources } from '@/entities/media-source';
import { EpisodeSelector } from '@/features/episode-selection';
import { FavoriteButton } from '@/features/favorite';
import { usePlaybackSession } from '@/features/playback-session';
import { SeasonSelector } from '@/features/season-selection';
import { SourceSelector } from '@/features/source-selection';
import { MediaInfo } from '@/widgets/media-info';
import { MediaPlayer, type MediaPlayerStatus } from '@/widgets/media-player';
import { useEffect, useState } from 'react';

export type MediaViewProps = {
  media: MediaDetails;
};

export function MediaView({ media }: MediaViewProps) {
  const { session, startSession, endSession } = usePlaybackSession();
  const mediaSession = session?.mediaRef === media.mediaRef ? session : null;
  const initialSeason =
    media.type === 'series'
      ? (media.seasons.find((season) => season.number === mediaSession?.episode?.seasonNumber) ??
        media.seasons[0])
      : undefined;
  const [isFavorite, setIsFavorite] = useState(false);
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState<number | null>(
    initialSeason?.number ?? null,
  );
  const [selectedEpisodeNumber, setSelectedEpisodeNumber] = useState<number | null>(
    media.type === 'series'
      ? (initialSeason?.episodes.find(
          (episode) => episode.episodeNumber === mediaSession?.episode?.episodeNumber,
        )?.episodeNumber ??
          initialSeason?.episodes[0]?.episodeNumber ??
          null)
      : media.type === 'anime'
        ? (media.episodes.find(
            (episode) => episode.episodeNumber === mediaSession?.episode?.episodeNumber,
          )?.episodeNumber ??
          media.episodes[0]?.episodeNumber ??
          null)
        : null,
  );
  const [selectedSourceRef, setSelectedSourceRef] = useState<string | null>(
    demoMediaSources.some((source) => source.sourceRef === mediaSession?.sourceRef)
      ? (mediaSession?.sourceRef ?? null)
      : (demoMediaSources[0]?.sourceRef ?? null),
  );
  const [playerStatus, setPlayerStatus] = useState<MediaPlayerStatus>('ready');

  const selectedSource = demoMediaSources.find((source) => source.sourceRef === selectedSourceRef);
  const selectedSeason =
    media.type === 'series'
      ? media.seasons.find((season) => season.number === selectedSeasonNumber)
      : undefined;
  const episodes =
    media.type === 'series'
      ? (selectedSeason?.episodes ?? [])
      : media.type === 'anime'
        ? media.episodes
        : [];
  const selectedEpisode = episodes.find(
    (episode) => episode.episodeNumber === selectedEpisodeNumber,
  );
  const isPlayerStarted =
    mediaSession?.sourceRef === selectedSourceRef &&
    (media.type === 'movie' ||
      (mediaSession.episode?.seasonNumber === selectedEpisode?.seasonNumber &&
        mediaSession.episode?.episodeNumber === selectedEpisode?.episodeNumber));

  const resetPlayer = () => {
    if (mediaSession) {
      endSession();
    }

    setPlayerStatus('ready');
  };

  const selectSource = (sourceRef: string | null) => {
    setSelectedSourceRef(sourceRef);
    resetPlayer();
  };

  const selectSeason = (seasonNumber: number) => {
    const season =
      media.type === 'series'
        ? media.seasons.find((item) => item.number === seasonNumber)
        : undefined;

    setSelectedSeasonNumber(seasonNumber);
    setSelectedEpisodeNumber(season?.episodes[0]?.episodeNumber ?? null);
    resetPlayer();
  };

  const selectEpisode = (episodeNumber: number) => {
    setSelectedEpisodeNumber(episodeNumber);
    resetPlayer();
  };

  const loadPlayer = () => {
    if (!selectedSource) return;

    startSession({
      mediaRef: media.mediaRef,
      sourceRef: selectedSource.sourceRef,
      episode:
        media.type === 'movie' || !selectedEpisode
          ? null
          : {
              seasonNumber: selectedEpisode.seasonNumber,
              episodeNumber: selectedEpisode.episodeNumber,
              absoluteEpisodeNumber: selectedEpisode.absoluteEpisodeNumber,
            },
      durationSeconds:
        selectedEpisode?.runtimeMinutes !== undefined
          ? selectedEpisode.runtimeMinutes * 60
          : media.runtimeMinutes !== undefined
            ? media.runtimeMinutes * 60
            : null,
    });
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
        <div className="flex flex-col gap-3 bg-surface-elevated px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:gap-8">
          <SourceSelector
            sources={demoMediaSources}
            selectedSourceRef={selectedSourceRef}
            onSourceChange={selectSource}
            variant="inline"
          />

          {media.type !== 'movie' && (
            <div className="grid min-w-0 grid-cols-2 gap-3 lg:flex lg:items-center lg:gap-5">
              {media.type === 'series' && (
                <SeasonSelector
                  seasons={media.seasons}
                  selectedSeasonNumber={selectedSeasonNumber}
                  onSeasonChange={selectSeason}
                  variant="inline"
                />
              )}

              <EpisodeSelector
                episodes={episodes}
                selectedEpisodeNumber={selectedEpisodeNumber}
                onEpisodeChange={selectEpisode}
                variant="inline"
              />
            </div>
          )}
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
