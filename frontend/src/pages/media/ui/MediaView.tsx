import type { MediaDetails, MediaEpisode, MediaSeason } from '@/entities/media';
import {
  getMediaSourcePlaybackIssue,
  type MediaAvailability,
  type MediaSourceEpisodeRef,
  type MediaSourceOption,
} from '@/entities/media-source';
import type { PlaybackEpisodeSelection } from '@/entities/playback';
import { EpisodeSelector } from '@/features/episode-selection';
import { FavoriteButton, useFavorites } from '@/features/favorite';
import { usePlaybackSession } from '@/features/playback-session';
import { SeasonSelector } from '@/features/season-selection';
import {
  createPlaybackSourceCatalog,
  DirectSourceSelector,
  findDirectEpisodeByRef,
  findDirectEpisodeBySourceRef,
  getDirectEpisodeDisplayNumber,
  getDirectQualityKey,
  getDirectQualityOptions,
  getDirectTrackKey,
  getDirectTrackOptions,
  getPreferredSource,
  PlaybackModeSelector,
  SourceSelector,
  type DirectEpisodeOption,
  type PlaybackMode,
} from '@/features/source-selection';
import { MediaCast } from '@/widgets/mdeia-cast';
import { MediaFacts, MediaInfo } from '@/widgets/media-info';
import {
  MediaPlayer,
  type MediaPlayerEmptyState,
  type MediaPlayerStatus,
} from '@/widgets/media-player';
import { Spinner } from '@/shared';
import { useCallback, useState } from 'react';

import type { MediaAvailabilityStatus } from '../model/useMediaAvailability';
import { useMediaEpisodeAvailability } from '../model/useMediaEpisodeAvailability';

export type MediaViewProps = {
  media: MediaDetails;
  availability: MediaAvailability | null;
  availabilityPending: boolean;
  availabilityStatus: MediaAvailabilityStatus;
};

const emptyAvailability: MediaAvailability = {
  sources: [],
  episodes: [],
  checkedAt: '',
  degraded: false,
  hasExpiredSources: false,
};

type AvailabilityToolbarStatusProps = Pick<
  MediaViewProps,
  'availability' | 'availabilityPending' | 'availabilityStatus'
>;

function AvailabilityToolbarStatus({
  availability,
  availabilityPending,
  availabilityStatus,
}: AvailabilityToolbarStatusProps) {
  const isInitialLoading = !availability && availabilityPending && availabilityStatus === 'loading';

  if (isInitialLoading) {
    return (
      <div className="flex min-h-10 min-w-48 flex-1 items-center justify-center" aria-live="polite">
        <Spinner size="medium" label="Подбираем варианты просмотра" />
      </div>
    );
  }

  return null;
}

function getMediaPlayerEmptyState(
  availability: MediaAvailability | null,
  availabilityPending: boolean,
  availabilityStatus: MediaAvailabilityStatus,
  hasPlaybackSources: boolean,
): MediaPlayerEmptyState | undefined {
  if (hasPlaybackSources) {
    return undefined;
  }

  if (availabilityPending || (!availability && availabilityStatus === 'loading')) {
    return undefined;
  }

  if (availability?.hasExpiredSources) {
    return {
      title: 'Ссылки на просмотр устарели',
      description: 'Мы обновляем доступные варианты просмотра.',
      visualCode: '↻',
      visualLabel: 'Обновление ссылок',
    };
  }

  if (availability?.degraded || availabilityStatus === 'error') {
    return {
      title: 'Ищем доступные варианты',
      description: 'Часть медиатеки временно не отвечает. Мы продолжим поиск автоматически.',
      visualCode: '…',
      visualLabel: 'Восстановление',
    };
  }

  return {
    title: 'Варианты просмотра пока не найдены',
    description: 'Для этого произведения сейчас нет доступных источников.',
    visualCode: '—',
    visualLabel: 'Нет источников',
  };
}

function getPlaybackEpisode(
  episode: DirectEpisodeOption | undefined,
): PlaybackEpisodeSelection | null {
  const episodeNumber = episode ? getDirectEpisodeDisplayNumber(episode) : undefined;

  if (!episode || episodeNumber === undefined) {
    return null;
  }

  return {
    seasonNumber: episode.seasonNumber,
    episodeNumber,
    absoluteEpisodeNumber: episode.absoluteEpisodeNumber,
  };
}

function getAvailabilityEpisode(
  media: MediaDetails,
  episode: DirectEpisodeOption | undefined,
): MediaSourceEpisodeRef | null {
  if (!episode || media.type === 'movie') return null;

  if (media.type === 'anime') {
    return episode.absoluteEpisodeNumber === undefined
      ? null
      : { absoluteEpisodeNumber: episode.absoluteEpisodeNumber };
  }

  if (episode.seasonNumber === undefined || episode.episodeNumber === undefined) {
    return null;
  }

  return {
    seasonNumber: episode.seasonNumber,
    episodeNumber: episode.episodeNumber,
  };
}

function matchesEpisode(episode: MediaSourceEpisodeRef, selection: MediaSourceEpisodeRef) {
  if (selection.absoluteEpisodeNumber !== undefined) {
    return episode.absoluteEpisodeNumber === selection.absoluteEpisodeNumber;
  }

  return (
    episode.seasonNumber === selection.seasonNumber &&
    episode.episodeNumber === selection.episodeNumber
  );
}

function mergeEpisodeSources(
  baseSources: readonly MediaSourceOption[],
  availability: MediaAvailability | null,
  selection: MediaSourceEpisodeRef | null,
) {
  if (!availability || !selection) return baseSources;

  const exactSources = availability.episodes
    .filter((episode) => matchesEpisode(episode, selection))
    .flatMap((episode) => episode.sources)
    .filter((source) => source.kind !== 'embed');

  if (exactSources.length === 0) return baseSources;

  return [
    ...new Map(
      [...baseSources, ...exactSources].map((source) => [source.sourceRef, source]),
    ).values(),
  ];
}

function findEpisodeMetadata(media: MediaDetails, episode: DirectEpisodeOption | undefined) {
  if (!episode || media.type === 'movie') return undefined;

  if (media.type === 'series') {
    return media.seasons
      .find((season) => season.number === episode.seasonNumber)
      ?.episodes.find((item) => item.episodeNumber === episode.episodeNumber);
  }

  return media.episodes.find((item) => {
    if (
      episode.absoluteEpisodeNumber !== undefined &&
      item.absoluteEpisodeNumber === episode.absoluteEpisodeNumber
    ) {
      return true;
    }

    return item.episodeNumber === getDirectEpisodeDisplayNumber(episode);
  });
}

function toEpisodeSelectorOption(episode: DirectEpisodeOption): MediaEpisode | null {
  const episodeNumber = getDirectEpisodeDisplayNumber(episode);

  if (episodeNumber === undefined) return null;

  return {
    seasonNumber: episode.seasonNumber,
    episodeNumber,
    absoluteEpisodeNumber: episode.absoluteEpisodeNumber,
    title: episode.title,
  };
}

function hasSameEpisode(
  first: PlaybackEpisodeSelection | null,
  second: PlaybackEpisodeSelection | null,
) {
  if (!first || !second) return first === second;

  return (
    first.seasonNumber === second.seasonNumber &&
    first.episodeNumber === second.episodeNumber &&
    first.absoluteEpisodeNumber === second.absoluteEpisodeNumber
  );
}

export function MediaView({
  media,
  availability,
  availabilityPending,
  availabilityStatus,
}: MediaViewProps) {
  const { session, startSession, pauseSession, resumeSession, updateProgress, endSession } =
    usePlaybackSession();
  const { isFavorite, addFavorite, removeFavorite } = useFavorites();
  const mediaIsFavorite = isFavorite(media.mediaRef);
  const mediaSession = session?.mediaRef === media.mediaRef ? session : null;

  const catalog = createPlaybackSourceCatalog(availability ?? emptyAvailability);
  const usesDirectEpisodes = media.type !== 'movie' && catalog.directEpisodes.length > 0;
  const hasEmbedMode = catalog.embedSources.length > 0;
  const hasDirectMode = usesDirectEpisodes
    ? catalog.directEpisodes.length > 0
    : catalog.directSources.length > 0;
  const hasPlaybackSources = hasEmbedMode || hasDirectMode;

  const playerEmptyState = getMediaPlayerEmptyState(
    availability,
    availabilityPending,
    availabilityStatus,
    hasPlaybackSources,
  );

  const sessionEmbedSource = catalog.embedSources.find(
    (source) => source.sourceRef === mediaSession?.sourceRef,
  );
  const sessionDirectEpisode = usesDirectEpisodes
    ? (findDirectEpisodeBySourceRef(catalog.directEpisodes, mediaSession?.sourceRef) ??
      findDirectEpisodeByRef(catalog.directEpisodes, mediaSession?.episode))
    : undefined;
  const sessionDirectSource = usesDirectEpisodes
    ? sessionDirectEpisode?.sources.find((source) => source.sourceRef === mediaSession?.sourceRef)
    : catalog.directSources.find((source) => source.sourceRef === mediaSession?.sourceRef);

  const initialMode: PlaybackMode = sessionEmbedSource
    ? 'embed'
    : sessionDirectSource || (sessionDirectEpisode && mediaSession)
      ? 'direct'
      : hasEmbedMode
        ? 'embed'
        : 'direct';
  const initialDirectEpisode = sessionDirectEpisode ?? catalog.directEpisodes[0];
  const initialDirectSources = usesDirectEpisodes
    ? (initialDirectEpisode?.sources ?? [])
    : catalog.directSources;

  const [playbackMode, setPlaybackMode] = useState<PlaybackMode>(initialMode);
  const [selectedEmbedSourceRef, setSelectedEmbedSourceRef] = useState<string | null>(
    sessionEmbedSource?.sourceRef ?? getPreferredSource(catalog.embedSources)?.sourceRef ?? null,
  );
  const [selectedDirectEpisodeKey, setSelectedDirectEpisodeKey] = useState<string | null>(
    initialDirectEpisode?.key ?? null,
  );
  const [selectedDirectSourceRef, setSelectedDirectSourceRef] = useState<string | null>(
    sessionDirectSource?.sourceRef ??
      (sessionDirectEpisode && mediaSession ? mediaSession.sourceRef : undefined) ??
      getPreferredSource(initialDirectSources)?.sourceRef ??
      null,
  );
  const [playerStatus, setPlayerStatus] = useState<MediaPlayerStatus>('ready');
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  const selectedEmbedSource =
    catalog.embedSources.find((source) => source.sourceRef === selectedEmbedSourceRef) ??
    getPreferredSource(catalog.embedSources);
  const selectedDirectEpisode = usesDirectEpisodes
    ? (catalog.directEpisodes.find((episode) => episode.key === selectedDirectEpisodeKey) ??
      catalog.directEpisodes[0])
    : undefined;
  const availabilityEpisode = getAvailabilityEpisode(media, selectedDirectEpisode);
  const { availability: episodeAvailability, isPending: episodeAvailabilityPending } =
    useMediaEpisodeAvailability(media.mediaRef, availabilityEpisode);
  const currentDirectSources = usesDirectEpisodes
    ? mergeEpisodeSources(
        selectedDirectEpisode?.sources ?? [],
        episodeAvailability,
        availabilityEpisode,
      )
    : catalog.directSources;
  const selectedDirectSource =
    currentDirectSources.find((source) => source.sourceRef === selectedDirectSourceRef) ??
    getPreferredSource(currentDirectSources);
  const selectedSource = playbackMode === 'embed' ? selectedEmbedSource : selectedDirectSource;
  const selectedSourceRef = selectedSource?.sourceRef ?? null;

  const directTracks = getDirectTrackOptions(currentDirectSources);
  const selectedTrackKey = selectedDirectSource ? getDirectTrackKey(selectedDirectSource) : null;
  const selectedTrack = directTracks.find((track) => track.key === selectedTrackKey);
  const directQualities = getDirectQualityOptions(selectedTrack?.sources ?? []);
  const selectedQualityKey = selectedDirectSource
    ? getDirectQualityKey(selectedDirectSource)
    : null;

  const directSeasonNumbers = Array.from(
    new Set(
      catalog.directEpisodes.flatMap((episode) =>
        episode.seasonNumber === undefined ? [] : [episode.seasonNumber],
      ),
    ),
  ).sort((first, second) => first - second);
  const directSeasons: readonly MediaSeason[] = directSeasonNumbers.map((seasonNumber) => ({
    number: seasonNumber,
    episodes: [],
  }));
  const episodesForSelectedSeason =
    directSeasonNumbers.length > 0
      ? catalog.directEpisodes.filter(
          (episode) => episode.seasonNumber === selectedDirectEpisode?.seasonNumber,
        )
      : catalog.directEpisodes;
  const directEpisodeOptions = episodesForSelectedSeason
    .map(toEpisodeSelectorOption)
    .filter((episode): episode is MediaEpisode => episode !== null);

  const selectedPlaybackEpisode =
    playbackMode === 'direct' && usesDirectEpisodes
      ? getPlaybackEpisode(selectedDirectEpisode)
      : null;
  const sessionPlaybackEpisode = mediaSession?.episode ?? null;
  const isPlayerStarted =
    mediaSession?.sourceRef === selectedSourceRef &&
    (playbackMode === 'embed' || hasSameEpisode(sessionPlaybackEpisode, selectedPlaybackEpisode));

  const resetPlayer = () => {
    if (mediaSession) {
      endSession();
    }

    setPlayerStatus('ready');
  };

  const selectPlaybackMode = (mode: PlaybackMode) => {
    if (mode === playbackMode) return;

    setPlaybackMode(mode);
    resetPlayer();
  };

  const selectEmbedSource = (sourceRef: string | null) => {
    if (sourceRef === selectedEmbedSource?.sourceRef) return;

    setSelectedEmbedSourceRef(sourceRef);
    resetPlayer();
  };

  const selectDirectSource = (source: MediaSourceOption | undefined) => {
    if (!source || source.sourceRef === selectedDirectSource?.sourceRef) return;

    setSelectedDirectSourceRef(source.sourceRef);
    resetPlayer();
  };

  const selectSeason = (seasonNumber: number) => {
    if (seasonNumber === selectedDirectEpisode?.seasonNumber) return;

    const nextEpisode = catalog.directEpisodes.find(
      (episode) => episode.seasonNumber === seasonNumber,
    );

    if (!nextEpisode) return;

    setSelectedDirectEpisodeKey(nextEpisode.key);
    setSelectedDirectSourceRef(getPreferredSource(nextEpisode.sources)?.sourceRef ?? null);
    resetPlayer();
  };

  const selectEpisode = (episodeNumber: number) => {
    const nextEpisode = episodesForSelectedSeason.find(
      (episode) => getDirectEpisodeDisplayNumber(episode) === episodeNumber,
    );

    if (!nextEpisode || nextEpisode.key === selectedDirectEpisode?.key) return;

    setSelectedDirectEpisodeKey(nextEpisode.key);
    setSelectedDirectSourceRef(getPreferredSource(nextEpisode.sources)?.sourceRef ?? null);
    resetPlayer();
  };

  const selectTrack = (trackKey: string) => {
    const track = directTracks.find((option) => option.key === trackKey);
    selectDirectSource(getDirectQualityOptions(track?.sources ?? [])[0]?.source);
  };

  const selectQuality = (qualityKey: string) => {
    selectDirectSource(directQualities.find((quality) => quality.key === qualityKey)?.source);
  };

  const loadPlayer = () => {
    if (!selectedSource || getMediaSourcePlaybackIssue(selectedSource)) {
      return;
    }

    const selectedEpisodeMetadata = findEpisodeMetadata(media, selectedDirectEpisode);

    startSession({
      mediaRef: media.mediaRef,
      mediaSnapshot: {
        title: media.title,
        artwork: media.backdrop ?? media.poster,
      },
      sourceRef: selectedSource.sourceRef,
      episode: selectedPlaybackEpisode,
      durationSeconds:
        selectedSource.kind === 'hls' || selectedSource.kind === 'mp4'
          ? selectedEpisodeMetadata?.runtimeMinutes !== undefined
            ? selectedEpisodeMetadata.runtimeMinutes * 60
            : media.runtimeMinutes !== undefined
              ? media.runtimeMinutes * 60
              : null
          : null,
    });
    const canLoadSource =
      (selectedSource.kind === 'embed' ||
        selectedSource.kind === 'hls' ||
        selectedSource.kind === 'mp4') &&
      selectedSource.browserSupported &&
      selectedSource.availability === 'available';

    setPlayerStatus(canLoadSource ? 'loading' : 'ready');
  };

  const handlePlayerReady = useCallback(() => {
    setPlayerStatus('ready');
  }, []);

  const handlePlayerError = useCallback(() => {
    setPlayerStatus('error');
  }, []);

  return (
    <div className="grid min-w-0 items-start gap-8 xl:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)] xl:gap-10">
      <div className="order-2 min-w-0 space-y-8 xl:order-none xl:col-start-2 xl:row-start-1">
        <div className="min-w-0 overflow-hidden rounded-card border border-context-border bg-surface shadow-surface">
          <div
            className={[
              'flex min-w-0 flex-col gap-3 bg-surface-elevated px-4 py-3 sm:px-5',
              'min-[70rem]:flex-row min-[70rem]:flex-wrap min-[70rem]:items-center',
              playbackMode === 'direct' && usesDirectEpisodes
                ? 'min-[70rem]:gap-x-3'
                : 'min-[70rem]:gap-x-6',
            ].join(' ')}
          >
            {hasEmbedMode && hasDirectMode && (
              <PlaybackModeSelector
                value={playbackMode}
                onChange={selectPlaybackMode}
                compactDesktop={playbackMode === 'direct' && usesDirectEpisodes}
              />
            )}

            {playbackMode === 'embed' && hasEmbedMode && (
              <SourceSelector
                sources={catalog.embedSources}
                selectedSourceRef={selectedEmbedSource?.sourceRef ?? null}
                onSourceChange={selectEmbedSource}
                variant="inline"
                includeDetails={false}
              />
            )}

            {playbackMode === 'direct' && hasDirectMode && (
              <>
                {usesDirectEpisodes && (
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row min-[70rem]:shrink-0 min-[70rem]:gap-3">
                    {directSeasonNumbers.length > 0 && (
                      <SeasonSelector
                        seasons={directSeasons}
                        selectedSeasonNumber={selectedDirectEpisode?.seasonNumber ?? null}
                        onSeasonChange={selectSeason}
                        variant="inline"
                        compactDesktop
                      />
                    )}

                    <EpisodeSelector
                      episodes={directEpisodeOptions}
                      selectedEpisodeNumber={
                        selectedDirectEpisode
                          ? (getDirectEpisodeDisplayNumber(selectedDirectEpisode) ?? null)
                          : null
                      }
                      onEpisodeChange={selectEpisode}
                      variant="inline"
                      compactDesktop
                    />
                  </div>
                )}

                {selectedDirectSource && usesDirectEpisodes && (
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row min-[70rem]:shrink-0 min-[70rem]:gap-3">
                    <DirectSourceSelector
                      tracks={directTracks.map((track) => ({
                        value: track.key,
                        label: track.label,
                      }))}
                      selectedTrackKey={selectedTrackKey}
                      onTrackChange={selectTrack}
                      qualities={directQualities.map((quality) => ({
                        value: quality.key,
                        label: quality.label,
                      }))}
                      selectedQualityKey={selectedQualityKey}
                      onQualityChange={selectQuality}
                      compactDesktop
                      isLoading={episodeAvailabilityPending}
                      showQuality={directQualities.length > 1}
                    />
                  </div>
                )}

                {selectedDirectSource && !usesDirectEpisodes && (
                  <DirectSourceSelector
                    tracks={directTracks.map((track) => ({
                      value: track.key,
                      label: track.label,
                    }))}
                    selectedTrackKey={selectedTrackKey}
                    onTrackChange={selectTrack}
                    qualities={directQualities.map((quality) => ({
                      value: quality.key,
                      label: quality.label,
                    }))}
                    selectedQualityKey={selectedQualityKey}
                    onQualityChange={selectQuality}
                    isLoading={availabilityPending}
                    showQuality={directQualities.length > 1}
                  />
                )}
              </>
            )}

            <AvailabilityToolbarStatus
              availability={availability}
              availabilityPending={availabilityPending}
              availabilityStatus={availabilityStatus}
            />
          </div>

          <MediaPlayer
            mediaTitle={media.title}
            backdrop={media.backdrop}
            source={selectedSource}
            isStarted={isPlayerStarted}
            shouldAutoPlay={mediaSession?.state === 'playing'}
            initialPositionSeconds={mediaSession?.positionSeconds ?? 0}
            status={playerStatus}
            onStart={loadPlayer}
            onReady={handlePlayerReady}
            onError={handlePlayerError}
            onPlay={resumeSession}
            onPause={pauseSession}
            onProgress={updateProgress}
            onRetry={loadPlayer}
            emptyState={playerEmptyState}
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
