import type { AnimeSeasonChainEntry, MediaDetails, MediaEpisode } from '@/entities/media';
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
  PlaybackSourcePicker,
  findDirectEpisodeByRef,
  findDirectEpisodeBySourceRef,
  getAdjacentDirectEpisodes,
  getAvailableDirectSourceForTrack,
  getDirectEpisodeDisplayNumber,
  getDirectQualityKey,
  getDirectQualityOptions,
  getDirectTrackKey,
  getDirectTrackOptions,
  getNextDirectEpisode,
  getPreferredSource,
  getDirectSourceForTrackPreference,
  isDirectMediaSource,
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
import { useCallback, useEffect, useState } from 'react';

import type { MediaAvailabilityStatus } from '../model/useMediaAvailability';
import { useMediaEpisodeAvailability } from '../model/useMediaEpisodeAvailability';
import { useMediaEpisodePrefetch } from '../model/useMediaEpisodePrefetch';
import {
  createAnimeSeasonSelectorState,
  createCanonicalAnimeEpisodeOptions,
} from '../model/animeSeasonNavigation';
import {
  createAnimePlaybackEpisodes,
  getAvailabilityEpisode,
} from '../model/animeEpisodeAvailability';
import { resolveAvailablePlaybackMode } from '../model/playbackModeResolution';

export type MediaViewProps = {
  media: MediaDetails;
  animeSeasonChain: readonly AnimeSeasonChainEntry[];
  onAnimeSeasonChange: (seasonNumber: number) => void;
  onAnimeEpisodeChange: (seasonNumber: number, episodeNumber: number) => void;
  initialAnimeEpisodeNumber?: number;
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

function AvailabilityToolbarStatus() {
  return (
    <div className="flex min-h-12 w-full items-center justify-center" aria-live="polite">
      <Spinner size="medium" label="Подбираем варианты просмотра" />
    </div>
  );
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

function matchesEpisode(episode: MediaSourceEpisodeRef, selection: MediaSourceEpisodeRef) {
  const matchesAbsoluteEpisode =
    selection.absoluteEpisodeNumber !== undefined &&
    episode.absoluteEpisodeNumber === selection.absoluteEpisodeNumber;

  const matchesSeasonEpisode =
    selection.episodeNumber !== undefined &&
    episode.episodeNumber === selection.episodeNumber &&
    (selection.seasonNumber === undefined || episode.seasonNumber === selection.seasonNumber);

  return matchesAbsoluteEpisode || matchesSeasonEpisode;
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
    .filter(isDirectMediaSource);

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
    if (episode.releaseEpisodeNumber !== undefined) {
      return item.episodeNumber === episode.releaseEpisodeNumber;
    }

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
  animeSeasonChain,
  onAnimeSeasonChange,
  onAnimeEpisodeChange,
  initialAnimeEpisodeNumber,
  availability,
  availabilityPending,
  availabilityStatus,
}: MediaViewProps) {
  const { session, startSession, pauseSession, resumeSession, updateProgress, endSession } =
    usePlaybackSession();
  const { isFavorite, addFavorite, removeFavorite, canUpdateFavorites } = useFavorites();
  const mediaIsFavorite = isFavorite(media.mediaRef);
  const mediaSession = session?.mediaRef === media.mediaRef ? session : null;

  const catalog = createPlaybackSourceCatalog(availability ?? emptyAvailability);
  const currentAnimeSeason = animeSeasonChain.find((season) => season.mediaRef === media.mediaRef);
  const animeReleaseCoordinates =
    media.type === 'anime'
      ? (currentAnimeSeason ?? {
          number: 1,
          seasonEpisodeOffset: 0,
          absoluteEpisodeOffset: 0,
        })
      : undefined;
  const directEpisodes = createAnimePlaybackEpisodes(
    media,
    catalog.directEpisodes,
    animeReleaseCoordinates,
  );
  const animeSeasonSelector = createAnimeSeasonSelectorState(animeSeasonChain, media.mediaRef);
  const usesDirectEpisodes = media.type !== 'movie' && directEpisodes.length > 0;
  const hasEmbedMode = catalog.embedSources.length > 0;
  const hasInitialDirectMode = usesDirectEpisodes
    ? catalog.directEpisodes.length > 0
    : catalog.directSources.length > 0;
  const hasInitialPlaybackSources = hasEmbedMode || hasInitialDirectMode;

  const sessionEmbedSource = catalog.embedSources.find(
    (source) => source.sourceRef === mediaSession?.sourceRef,
  );
  const sessionDirectEpisode = usesDirectEpisodes
    ? (findDirectEpisodeBySourceRef(directEpisodes, mediaSession?.sourceRef) ??
      findDirectEpisodeByRef(directEpisodes, mediaSession?.episode))
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
  const requestedAnimeEpisode =
    media.type === 'anime' && initialAnimeEpisodeNumber !== undefined
      ? directEpisodes.find(({ episodeNumber }) => episodeNumber === initialAnimeEpisodeNumber)
      : undefined;
  const initialDirectEpisode = sessionDirectEpisode ?? requestedAnimeEpisode ?? directEpisodes[0];
  const initialDirectSources = usesDirectEpisodes
    ? (initialDirectEpisode?.sources ?? [])
    : catalog.directSources;

  const [selectedPlaybackMode, setSelectedPlaybackMode] = useState<PlaybackMode>(initialMode);
  const [isPlaybackModeInitialized, setIsPlaybackModeInitialized] =
    useState(hasInitialPlaybackSources);
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
  const [preferredDirectTrackKey, setPreferredDirectTrackKey] = useState<string | null>(
    sessionDirectSource ? getDirectTrackKey(sessionDirectSource) : null,
  );
  const [toolbarResolvedMediaRef, setToolbarResolvedMediaRef] = useState<string | null>(null);
  const [sourceSearchSettledMediaRef, setSourceSearchSettledMediaRef] = useState<string | null>(
    null,
  );
  const [playerStatus, setPlayerStatus] = useState<MediaPlayerStatus>('ready');
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const playbackMode = isPlaybackModeInitialized ? selectedPlaybackMode : initialMode;

  const selectedEmbedSource =
    catalog.embedSources.find((source) => source.sourceRef === selectedEmbedSourceRef) ??
    sessionEmbedSource ??
    getPreferredSource(catalog.embedSources);
  const selectedDirectEpisode = usesDirectEpisodes
    ? (directEpisodes.find((episode) => episode.key === selectedDirectEpisodeKey) ??
      initialDirectEpisode)
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
  const hasDirectMode = currentDirectSources.length > 0;
  const hasPlaybackSources = hasEmbedMode || hasDirectMode;
  const directModePending = usesDirectEpisodes && episodeAvailabilityPending;
  const sourcesPending = availabilityPending || directModePending;
  const hasToolbarControls =
    hasPlaybackSources && (media.type === 'movie' || usesDirectEpisodes);
  const initialToolbarLoadComplete = hasToolbarControls || !sourcesPending;
  const isToolbarLoading =
    toolbarResolvedMediaRef !== media.mediaRef && !initialToolbarLoadComplete;
  const playerEmptyState = getMediaPlayerEmptyState(
    availability,
    availabilityPending || directModePending,
    availabilityStatus,
    hasPlaybackSources,
  );

  useEffect(() => {
    if (initialToolbarLoadComplete && toolbarResolvedMediaRef !== media.mediaRef) {
      setToolbarResolvedMediaRef(media.mediaRef);
    }
  }, [initialToolbarLoadComplete, media.mediaRef, toolbarResolvedMediaRef]);

  useEffect(() => {
    if (!sourcesPending && sourceSearchSettledMediaRef !== media.mediaRef) {
      setSourceSearchSettledMediaRef(media.mediaRef);
    }
  }, [media.mediaRef, sourceSearchSettledMediaRef, sourcesPending]);

  useEffect(() => {
    if (!hasPlaybackSources && !directModePending) return;

    if (!isPlaybackModeInitialized) {
      setSelectedPlaybackMode(initialMode);
      setIsPlaybackModeInitialized(true);
      return;
    }

    const availableMode = resolveAvailablePlaybackMode(
      playbackMode,
      hasEmbedMode,
      hasDirectMode,
      directModePending,
    );

    if (availableMode !== playbackMode) setSelectedPlaybackMode(availableMode);
  }, [
    directModePending,
    hasDirectMode,
    hasEmbedMode,
    hasPlaybackSources,
    initialMode,
    isPlaybackModeInitialized,
    playbackMode,
  ]);
  const adjacentAvailabilityEpisodes = getAdjacentDirectEpisodes(
    directEpisodes,
    selectedDirectEpisode,
  )
    .map((episode) => getAvailabilityEpisode(media, episode))
    .filter((episode): episode is MediaSourceEpisodeRef => episode !== null);
  const canPrefetchEpisodes =
    playbackMode === 'direct' &&
    episodeAvailability !== null &&
    currentDirectSources.some(
      (source) => source.availability === 'available' && source.browserSupported,
    );

  useMediaEpisodePrefetch(
    media.mediaRef,
    availabilityEpisode,
    adjacentAvailabilityEpisodes,
    canPrefetchEpisodes,
  );

  const selectedDirectSource =
    currentDirectSources.find((source) => source.sourceRef === selectedDirectSourceRef) ??
    currentDirectSources.find((source) => source.sourceRef === mediaSession?.sourceRef) ??
    getPreferredSource(currentDirectSources);

  const selectedDirectTrackKey = selectedDirectSource
    ? getDirectTrackKey(selectedDirectSource)
    : null;
  const availablePreferredDirectSource = getAvailableDirectSourceForTrack(
    currentDirectSources,
    preferredDirectTrackKey,
  );

  useEffect(() => {
    if (selectedEmbedSourceRef === null && selectedEmbedSource) {
      setSelectedEmbedSourceRef(selectedEmbedSource.sourceRef);
    }

    if (selectedDirectEpisodeKey === null && selectedDirectEpisode) {
      setSelectedDirectEpisodeKey(selectedDirectEpisode.key);
    }

    if (selectedDirectSourceRef === null && selectedDirectSource) {
      setSelectedDirectSourceRef(selectedDirectSource.sourceRef);
    }

    if (preferredDirectTrackKey === null && selectedDirectTrackKey !== null) {
      setPreferredDirectTrackKey(selectedDirectTrackKey);
    }
  }, [
    preferredDirectTrackKey,
    selectedDirectEpisode,
    selectedDirectEpisodeKey,
    selectedDirectSource,
    selectedDirectSourceRef,
    selectedDirectTrackKey,
    selectedEmbedSource,
    selectedEmbedSourceRef,
  ]);

  useEffect(() => {
    if (
      !mediaSession &&
      availablePreferredDirectSource &&
      selectedDirectTrackKey !== preferredDirectTrackKey
    ) {
      setSelectedDirectSourceRef(availablePreferredDirectSource.sourceRef);
    }
  }, [
    availablePreferredDirectSource,
    mediaSession,
    preferredDirectTrackKey,
    selectedDirectTrackKey,
  ]);

  const selectedSource = playbackMode === 'embed' ? selectedEmbedSource : selectedDirectSource;
  const selectedSourceRef = selectedSource?.sourceRef ?? null;

  const directTracks = getDirectTrackOptions(currentDirectSources);
  const selectedDirectTrack = directTracks.find(
    (track) => track.key === selectedDirectTrackKey,
  );
  const directQualities = getDirectQualityOptions(selectedDirectTrack?.sources ?? []);
  const selectedDirectQualityKey = selectedDirectSource
    ? getDirectQualityKey(selectedDirectSource)
    : null;

  const directSeasonNumbers = Array.from(
    new Set(
      directEpisodes.flatMap((episode) =>
        episode.seasonNumber === undefined ? [] : [episode.seasonNumber],
      ),
    ),
  ).sort((first, second) => first - second);
  const directSeasons = directSeasonNumbers.map((seasonNumber) => ({
    number: seasonNumber,
  }));
  const episodesForSelectedSeason =
    directSeasonNumbers.length > 0
      ? directEpisodes.filter(
          (episode) => episode.seasonNumber === selectedDirectEpisode?.seasonNumber,
        )
      : directEpisodes;
  const canonicalAnimeEpisodeOptions = createCanonicalAnimeEpisodeOptions(
    animeSeasonChain,
    media.mediaRef,
  );
  const directEpisodeOptions =
    canonicalAnimeEpisodeOptions.length > 0
      ? canonicalAnimeEpisodeOptions
      : episodesForSelectedSeason
          .map(toEpisodeSelectorOption)
          .filter((episode): episode is MediaEpisode => episode !== null);
  const nextDirectEpisode = getNextDirectEpisode(directEpisodes, selectedDirectEpisode);

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

    setSelectedPlaybackMode(mode);
    setIsPlaybackModeInitialized(true);
    resetPlayer();
  };

  const selectEmbedSource = (sourceRef: string | null) => {
    if (sourceRef === selectedEmbedSource?.sourceRef) return;

    setSelectedEmbedSourceRef(sourceRef);
    resetPlayer();
  };

  const startDirectPlayback = (
    source: MediaSourceOption,
    episode: DirectEpisodeOption | undefined,
    positionSeconds: number,
  ) => {
    const episodeMetadata = findEpisodeMetadata(media, episode);

    startSession({
      mediaRef: media.mediaRef,
      mediaSnapshot: {
        title: media.title,
        artwork: media.backdrop ?? media.poster,
      },
      sourceRef: source.sourceRef,
      episode: usesDirectEpisodes ? getPlaybackEpisode(episode) : null,
      positionSeconds,
      durationSeconds:
        episodeMetadata?.runtimeMinutes !== undefined
          ? episodeMetadata.runtimeMinutes * 60
          : media.runtimeMinutes !== undefined
            ? media.runtimeMinutes * 60
            : null,
    });
    setPlayerStatus('loading');
  };

  const selectDirectSource = (
    source: MediaSourceOption | undefined,
    continuePlayback = false,
  ) => {
    if (!source || source.sourceRef === selectedDirectSource?.sourceRef) return;

    setSelectedDirectSourceRef(source.sourceRef);
    if (continuePlayback && isPlayerStarted) {
      startDirectPlayback(source, selectedDirectEpisode, mediaSession?.positionSeconds ?? 0);
    } else {
      resetPlayer();
    }
  };

  const selectDirectEpisode = (episode: DirectEpisodeOption) => {
    setSelectedDirectEpisodeKey(episode.key);
    setSelectedDirectSourceRef(
      getDirectSourceForTrackPreference(episode.sources, preferredDirectTrackKey)?.sourceRef ??
        null,
    );
    resetPlayer();
  };

  const selectSeason = (seasonNumber: number) => {
    if (seasonNumber === selectedDirectEpisode?.seasonNumber) return;

    const nextEpisode = directEpisodes.find((episode) => episode.seasonNumber === seasonNumber);

    if (!nextEpisode) return;

    selectDirectEpisode(nextEpisode);
  };

  const selectEpisode = (episodeNumber: number) => {
    const nextEpisode = episodesForSelectedSeason.find(
      (episode) => getDirectEpisodeDisplayNumber(episode) === episodeNumber,
    );

    if (!nextEpisode) {
      if (media.type === 'anime' && currentAnimeSeason) {
        onAnimeEpisodeChange(currentAnimeSeason.number, episodeNumber);
      }
      return;
    }

    if (nextEpisode.key === selectedDirectEpisode?.key) return;

    selectDirectEpisode(nextEpisode);
  };

  const selectTrack = (trackKey: string, continuePlayback = false) => {
    const track = directTracks.find((option) => option.key === trackKey);

    setPreferredDirectTrackKey(trackKey);
    selectDirectSource(
      getDirectQualityOptions(track?.sources ?? [])[0]?.source,
      continuePlayback,
    );
  };

  const selectNextEpisode = () => {
    if (nextDirectEpisode) {
      const nextSource = getDirectSourceForTrackPreference(
        nextDirectEpisode.sources,
        preferredDirectTrackKey,
      );

      if (!nextSource || !isPlayerStarted) {
        selectDirectEpisode(nextDirectEpisode);
        return;
      }

      setSelectedDirectEpisodeKey(nextDirectEpisode.key);
      setSelectedDirectSourceRef(nextSource.sourceRef);
      startDirectPlayback(nextSource, nextDirectEpisode, 0);
    }
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
        <div className="min-w-0">
          <div className="min-w-0 overflow-hidden rounded-card border border-context-border bg-surface shadow-surface">
            <div className="flex min-w-0 flex-col gap-3 bg-surface-elevated px-4 py-3 sm:px-5 min-[70rem]:flex-row min-[70rem]:flex-nowrap min-[70rem]:items-center min-[70rem]:gap-x-3">
              {isToolbarLoading ? (
                <AvailabilityToolbarStatus />
              ) : (
                <>
                  {animeSeasonSelector && (
                    <SeasonSelector
                      seasons={animeSeasonSelector.options}
                      selectedSeasonNumber={animeSeasonSelector.selectedSeasonNumber}
                      onSeasonChange={onAnimeSeasonChange}
                      variant="inline"
                      compactDesktop
                    />
                  )}

                  {usesDirectEpisodes && !animeSeasonSelector && directSeasonNumbers.length > 0 && (
                    <SeasonSelector
                      seasons={directSeasons}
                      selectedSeasonNumber={selectedDirectEpisode?.seasonNumber ?? null}
                      onSeasonChange={selectSeason}
                      variant="inline"
                      compactDesktop
                    />
                  )}

                  {usesDirectEpisodes && (
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
                  )}

                  <div className="w-full min-[70rem]:ml-auto min-[70rem]:w-auto">
                    <PlaybackSourcePicker
                      embedSources={catalog.embedSources}
                      directSources={currentDirectSources}
                      selectedSource={selectedSource}
                      selectedDirectSource={selectedDirectSource}
                      selectedTrackKey={selectedDirectTrackKey}
                      onEmbedSelect={(sourceRef) => {
                        if (playbackMode !== 'embed') selectPlaybackMode('embed');
                        selectEmbedSource(sourceRef);
                      }}
                      onDirectSelect={(trackKey) => {
                        if (playbackMode !== 'direct') selectPlaybackMode('direct');
                        selectTrack(trackKey);
                      }}
                      onQualitySelect={(sourceRef) =>
                        selectDirectSource(
                          currentDirectSources.find((source) => source.sourceRef === sourceRef),
                        )
                      }
                      isLoading={
                        sourcesPending && sourceSearchSettledMediaRef !== media.mediaRef
                      }
                      align="end"
                    />
                  </div>
                </>
              )}
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
              directControls={
                selectedDirectSource
                  ? {
                      tracks: directTracks.map((track) => ({
                        value: track.key,
                        label: track.label,
                      })),
                      selectedTrackKey: selectedDirectTrackKey,
                      onTrackChange: (trackKey) => selectTrack(trackKey, true),
                      qualities: directQualities.map((quality) => ({
                        value: quality.key,
                        label: quality.label,
                      })),
                      selectedQualityKey: selectedDirectQualityKey,
                      onQualityChange: (qualityKey) =>
                        selectDirectSource(
                          directQualities.find((quality) => quality.key === qualityKey)?.source,
                          true,
                        ),
                      onNextEpisode: nextDirectEpisode ? selectNextEpisode : undefined,
                    }
                  : undefined
              }
            />
          </div>
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
            disabled={!canUpdateFavorites}
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
