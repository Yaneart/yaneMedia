import type { MediaDetails } from '@/entities/media';
import { demoMediaSources } from '@/entities/media-source';
import { EpisodeSelector } from '@/features/episode-selection';
import { FavoriteButton, useFavorites } from '@/features/favorite';
import { usePlaybackSession } from '@/features/playback-session';
import { SeasonSelector } from '@/features/season-selection';
import { SourceSelector } from '@/features/source-selection';
import { MediaCast } from '@/widgets/mdeia-cast';
import { MediaFacts, MediaInfo } from '@/widgets/media-info';
import { MediaPlayer, type MediaPlayerStatus } from '@/widgets/media-player';
import { useEffect, useState } from 'react';

export type MediaViewProps = {
  media: MediaDetails;
};

export function MediaView({ media }: MediaViewProps) {
  const { session, startSession, endSession } = usePlaybackSession();

  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const mediaIsFavorite = isFavorite(media.mediaRef);

  const mediaSession = session?.mediaRef === media.mediaRef ? session : null;

  const initialSeason =
    media.type === 'series'
      ? (media.seasons.find((season) => season.number === mediaSession?.episode?.seasonNumber) ??
        media.seasons[0])
      : undefined;

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
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

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
    if (sourceRef === selectedSourceRef) return;

    setSelectedSourceRef(sourceRef);
    resetPlayer();
  };

  const selectSeason = (seasonNumber: number) => {
    if (seasonNumber === selectedSeasonNumber) return;

    const season =
      media.type === 'series'
        ? media.seasons.find((item) => item.number === seasonNumber)
        : undefined;

    setSelectedSeasonNumber(seasonNumber);
    setSelectedEpisodeNumber(season?.episodes[0]?.episodeNumber ?? null);
    resetPlayer();
  };

  const selectEpisode = (episodeNumber: number) => {
    if (episodeNumber === selectedEpisodeNumber) return;

    setSelectedEpisodeNumber(episodeNumber);
    resetPlayer();
  };

  const loadPlayer = () => {
    if (!selectedSource) return;

    startSession({
      mediaRef: media.mediaRef,
      mediaSnapshot: {
        title: media.title,
        artwork: media.backdrop ?? media.poster,
      },
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
    <div className="grid min-w-0 items-start gap-8 xl:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)] xl:gap-10">
      <div className="order-2 min-w-0 space-y-8 xl:order-none xl:col-start-2 xl:row-start-1">
        <div className="min-w-0 overflow-hidden rounded-card border border-context-border bg-surface shadow-surface">
          <div className="flex min-w-0 flex-col gap-3 bg-surface-elevated px-4 py-3 sm:px-5 min-[70rem]:flex-row min-[70rem]:items-center min-[70rem]:gap-8">
            <SourceSelector
              sources={demoMediaSources}
              selectedSourceRef={selectedSourceRef}
              onSourceChange={selectSource}
              variant="inline"
            />

            {media.type !== 'movie' && (
              <div className="grid min-w-0 grid-cols-2 gap-3 min-[70rem]:flex min-[70rem]:items-center min-[70rem]:gap-5">
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

        {media.description && (
          <section
            aria-label="Полное описание"
            className="hidden rounded-card border border-context-border bg-surface-elevated p-6 xl:block 2xl:hidden"
          >
            <h2 className="text-heading text-text-primary">Описание</h2>
            <p className="mt-3 text-body text-text-secondary">{media.description}</p>
          </section>
        )}
      </div>

      <MediaInfo
        media={media}
        variant="watch"
        actions={
          <FavoriteButton
            isFavorite={mediaIsFavorite}
            onFavoriteChange={(nextIsFavorite) => {
              if (nextIsFavorite) {
                addFavorite(media.mediaRef);
              } else {
                removeFavorite(media.mediaRef);
              }
            }}
            mediaTitle={media.title}
          />
        }
      />

      <section className="order-3 space-y-5 xl:hidden">
        {media.description && (
          <div className="sm:hidden">
            <h2 className="text-heading text-text-primary">Описание</h2>
            <p
              className={[
                'mt-3 text-body text-text-secondary',
                isDescriptionExpanded ? '' : 'line-clamp-4',
              ].join(' ')}
            >
              {media.description}
            </p>
            <button
              type="button"
              className="mt-2 text-sm font-semibold text-text-primary transition-colors hover:text-watermark"
              onClick={() => setIsDescriptionExpanded((current) => !current)}
              aria-expanded={isDescriptionExpanded}
            >
              {isDescriptionExpanded ? 'Свернуть' : 'Подробнее'}
            </button>
          </div>
        )}

        <MediaFacts media={media} className="grid gap-2 text-caption" />
      </section>

      {media.description && (
        <section
          aria-label="Полное описание"
          className="order-3 hidden rounded-card border border-context-border bg-surface-elevated p-6 2xl:col-span-2 2xl:block"
        >
          <h2 className="text-heading text-text-primary">Описание</h2>
          <p className="mt-3 max-w-5xl text-body text-text-secondary">{media.description}</p>
        </section>
      )}

      <MediaCast persons={media.persons} className="order-4 xl:col-span-2" />
    </div>
  );
}
