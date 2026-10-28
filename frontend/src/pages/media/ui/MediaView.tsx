import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/entities/auth';
import type { AnimeSeasonChainEntry, MediaDetails, MediaEpisode } from '@/entities/media';
import {
  getMediaSourcePlaybackIssue,
  type MediaAvailability,
  type MediaSourceEpisodeRef,
  type MediaSourceOption,
} from '@/entities/media-source';
import type { PlaybackEpisodeSelection } from '@/entities/playback';
import {
  cacheTorrentSession,
  isTorrentPlaybackSourceRef,
  replaceTorrentPlayback,
  stopTorrentSession,
  torrentPlaybackSourceRef,
  torrentSessionQueryOptions,
  torrentSessionQueryKeys,
  type TorrentSession,
  TorrentRequestError,
} from '@/entities/torrent-session';
import { EpisodeSelector } from '@/features/episode-selection';
import { FavoriteButton, useFavorites } from '@/features/favorite';
import { usePlaybackSession } from '@/features/playback-session';
import { MediaCommunity } from '@/features/media-community';
import { UserRating } from '@/features/user-rating';
import { SeasonSelector } from '@/features/season-selection';
import { TorrentLaunch } from '@/features/torrent-launch';
import {
  createPlaybackSourceCatalog,
  PlaybackSourcePicker,
  findDirectEpisodeByRef,
  findDirectEpisodeBySourceRef,
  getAdjacentDirectEpisodes,
  getAvailableDirectSourceForPlaybackPreference,
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
  mergeEpisodeEmbedSources,
  type DirectEpisodeOption,
  type PlaybackMode,
} from '@/features/source-selection';
import { MediaCast } from '@/widgets/mdeia-cast';
import { MediaDescriptionPanel, MediaFacts, MediaInfo } from '@/widgets/media-info';
import {
  MediaPlayer,
  type MediaPlayerEmptyState,
  type MediaPlayerStatus,
} from '@/widgets/media-player';
import { Spinner, YaneMark, YaneMarkField } from '@/shared';
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
  usesEpisodePlayback,
} from '../model/animeEpisodeAvailability';
import {
  resolveAvailablePlaybackMode,
  shouldShowLocalEpisodeControls,
} from '../model/playbackModeResolution';

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

type PendingDirectEpisodeTransition = {
  episodeKey: string;
  trackKey: string | null;
  qualityKey: string | null;
  continuePlayback: boolean;
};

const emptyAvailability: MediaAvailability = {
  sources: [],
  episodes: [],
  checkedAt: '',
  degraded: false,
  hasExpiredSources: false,
};

function AvailabilityToolbarStatus({ hasEpisodeControls }: { hasEpisodeControls: boolean }) {
  return (
    <div
      className={[
        'col-span-2 flex w-full items-center justify-center 2xl:flex-1',
        hasEpisodeControls ? 'min-h-32 sm:min-h-25 2xl:min-h-11' : 'min-h-10',
      ].join(' ')}
      aria-live="polite"
    >
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
  const {
    session,
    continueWatchingEntries,
    startSession,
    pauseSession,
    resumeSession,
    updateProgress,
    endSession,
  } = usePlaybackSession();
  const { isFavorite, isFavoriteUpdating, addFavorite, removeFavorite, canUpdateFavorites } =
    useFavorites();
  const mediaIsFavorite = isFavorite(media.mediaRef);
  const mediaSession = session?.mediaRef === media.mediaRef ? session : null;
  const { state: authState } = useAuth();
  const accountKey = authState.status === 'authenticated' ? authState.user.email : 'inactive';
  const queryClient = useQueryClient();
  const [torrentOpen, setTorrentOpen] = useState(false);
  const [torrentSelected, setTorrentSelected] = useState(false);
  const [torrentPlayRequest, setTorrentPlayRequest] = useState(0);
  const [torrentStarting, setTorrentStarting] = useState(false);
  const [torrentLaunchError, setTorrentLaunchError] = useState<string | null>(null);
  const [launchedTorrent, setLaunchedTorrent] = useState<{
    accountKey: string;
    session: TorrentSession;
  } | null>(null);
  const savedTorrentId =
    mediaSession && isTorrentPlaybackSourceRef(mediaSession.sourceRef)
      ? mediaSession.sourceRef.slice('torrent:'.length)
      : null;
  const torrentQuery = useQuery({
    ...torrentSessionQueryOptions(accountKey, savedTorrentId ?? 'inactive'),
    enabled: authState.status === 'authenticated' && !!savedTorrentId,
    refetchInterval: savedTorrentId ? 60_000 : false,
    refetchIntervalInBackground: true,
  });
  const torrentSession = savedTorrentId
    ? torrentQuery.data?.id === savedTorrentId
      ? torrentQuery.data
      : launchedTorrent?.accountKey === accountKey && launchedTorrent.session.id === savedTorrentId
        ? launchedTorrent.session
        : null
    : null;
  const torrentEnded =
    (torrentQuery.isError &&
      torrentQuery.error instanceof TorrentRequestError &&
      torrentQuery.error.status === 404) ||
    (torrentSession !== null &&
      launchedTorrent === null &&
      ['awaiting_file', 'awaiting_playback', 'failed'].includes(torrentSession.state));
  const activeTorrentId = torrentEnded ? null : savedTorrentId;

  useEffect(() => {
    if (!savedTorrentId || !torrentEnded) return;
    setLaunchedTorrent(null);
    setTorrentSelected(false);
    setTorrentStarting(false);
    setPlayerStatus('ready');
    endSession();
  }, [endSession, savedTorrentId, torrentEnded]);
  const torrentPlayback =
    !torrentEnded && torrentSession?.state === 'ready'
      ? torrentSession.playback
      : !torrentEnded &&
          torrentSession?.state === 'preparing' &&
          launchedTorrent?.accountKey === accountKey &&
          launchedTorrent.session.id === activeTorrentId
        ? launchedTorrent.session.playback
        : null;
  const torrentUnavailable =
    torrentQuery.isError ||
    (torrentSession !== null &&
      ['failed', 'awaiting_playback', 'awaiting_file'].includes(torrentSession.state));
  const torrentErrorDescription = torrentQuery.isError
    ? 'Не удалось связаться с торрент-сервисом. Проверьте подключение и повторите попытку.'
    : torrentSession?.failure?.code === 'TORRENT_TRANSCODE_FAILED'
      ? 'Не удалось преобразовать видео для браузера. Попробуйте другой файл.'
      : torrentSession?.failure?.code === 'TORRENT_PLAYBACK_TIMEOUT'
        ? 'Видео слишком медленно загружается от участников. Попробуйте позже.'
        : torrentSession?.failure?.code === 'TORRENT_UNSUPPORTED_MEDIA'
          ? 'Формат видео не поддерживается. Выберите другой файл.'
          : torrentSession?.failure?.code === 'TORRENT_CAPACITY_EXCEEDED'
            ? 'Сервис сейчас занят. Попробуйте позже.'
            : 'Проверьте состояние торрента в выборе источника и повторите запуск.';
  const torrentSource: MediaSourceOption | undefined =
    torrentPlayback && torrentSession
      ? {
          sourceRef: `${torrentPlaybackSourceRef(torrentSession.id)}:${torrentPlayback.generation}`,
          provider: 'torrent',
          kind: 'hls',
          label: 'Торрент',
          url: torrentPlayback.hlsUrl,
          availability: 'available',
          browserSupported: true,
        }
      : undefined;

  const catalog = createPlaybackSourceCatalog(
    availability ?? emptyAvailability,
    !usesEpisodePlayback(media),
  );
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
  const usesDirectEpisodes = usesEpisodePlayback(media) && directEpisodes.length > 0;
  const hasInitialEmbedMode = catalog.embedSources.length > 0;
  const hasInitialDirectMode = usesDirectEpisodes
    ? catalog.directEpisodes.length > 0
    : catalog.directSources.length > 0;
  const hasInitialPlaybackSources = hasInitialEmbedMode || hasInitialDirectMode;

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
      : hasInitialEmbedMode
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
  const [pendingDirectEpisodeTransition, setPendingDirectEpisodeTransition] =
    useState<PendingDirectEpisodeTransition | null>(null);
  const [toolbarResolvedMediaRef, setToolbarResolvedMediaRef] = useState<string | null>(null);
  const [sourceSearchSettledMediaRef, setSourceSearchSettledMediaRef] = useState<string | null>(
    null,
  );
  const [playerStatus, setPlayerStatus] = useState<MediaPlayerStatus>('ready');
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);
  const playbackMode = isPlaybackModeInitialized ? selectedPlaybackMode : initialMode;

  const selectedDirectEpisode = usesDirectEpisodes
    ? (directEpisodes.find((episode) => episode.key === selectedDirectEpisodeKey) ??
      initialDirectEpisode)
    : undefined;
  const availabilityEpisode = getAvailabilityEpisode(media, selectedDirectEpisode);
  const { availability: episodeAvailability, isPending: episodeAvailabilityPending } =
    useMediaEpisodeAvailability(media.mediaRef, availabilityEpisode);
  const hasPlayerManagedEpisodeEmbed = catalog.embedSources.some(
    (source) => source.provider === 'kodik-streaming',
  );
  const currentEmbedSources = hasPlayerManagedEpisodeEmbed
    ? catalog.embedSources
    : mergeEpisodeEmbedSources(catalog.embedSources, episodeAvailability, availabilityEpisode);
  const hasEmbedMode = currentEmbedSources.length > 0;
  const selectedEmbedSource =
    currentEmbedSources.find((source) => source.sourceRef === selectedEmbedSourceRef) ??
    sessionEmbedSource ??
    getPreferredSource(currentEmbedSources);
  const currentDirectSources = usesDirectEpisodes
    ? mergeEpisodeSources(
        selectedDirectEpisode?.sources ?? [],
        episodeAvailability,
        availabilityEpisode,
      )
    : catalog.directSources;
  const hasDirectMode = currentDirectSources.length > 0;
  const hasPlaybackSources = hasEmbedMode || hasDirectMode;
  const showLocalEpisodeControls = shouldShowLocalEpisodeControls(
    playbackMode,
    usesDirectEpisodes,
    hasPlayerManagedEpisodeEmbed,
  );
  const directModePending = usesDirectEpisodes && episodeAvailabilityPending;
  const sourcesPending = availabilityPending || directModePending;
  const hasToolbarControls = hasPlaybackSources && (media.type === 'movie' || usesDirectEpisodes);
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

  const selectedSource =
    activeTorrentId || torrentSelected
      ? (torrentSource ?? {
          sourceRef: 'torrent:selection',
          provider: 'torrent',
          kind: 'hls' as const,
          label: 'Торрент',
          url: '',
          availability: 'available' as const,
          browserSupported: true,
        })
      : playbackMode === 'embed'
        ? selectedEmbedSource
        : selectedDirectSource;
  const selectedSourceRef = selectedSource?.sourceRef ?? null;

  const directTracks = getDirectTrackOptions(currentDirectSources);
  const selectedDirectTrack = directTracks.find((track) => track.key === selectedDirectTrackKey);
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
    activeTorrentId !== null || torrentStarting
      ? true
      : mediaSession?.sourceRef === selectedSourceRef &&
        (playbackMode === 'embed' ||
          hasSameEpisode(sessionPlaybackEpisode, selectedPlaybackEpisode));

  const handleTorrentReady = useCallback(
    (ready: TorrentSession) => {
      if (!ready.playback) return;
      setTorrentStarting(false);
      setTorrentLaunchError(null);
      setLaunchedTorrent({ accountKey, session: ready });
      startSession({
        mediaRef: media.mediaRef,
        mediaSnapshot: {
          title: media.title,
          slug: media.slug,
          artwork: media.poster,
        },
        sourceRef: torrentPlaybackSourceRef(ready.id),
        episode: null,
        positionSeconds: ready.playback.startPositionSeconds,
        durationSeconds: ready.playback.durationSeconds,
      });
      setPlayerStatus('loading');
    },
    [accountKey, media, startSession],
  );

  const handleTorrentSessionChange = useCallback(
    (updated: TorrentSession | null) => {
      setLaunchedTorrent(updated ? { accountKey, session: updated } : null);
      if (!updated) {
        setTorrentSelected(false);
        setTorrentStarting(false);
      }
      if (!updated && mediaSession && isTorrentPlaybackSourceRef(mediaSession.sourceRef))
        endSession();
    },
    [accountKey, endSession, mediaSession],
  );

  const handleTorrentPlaybackError = useCallback((message: string) => {
    setTorrentLaunchError(message);
    setPlayerStatus('error');
  }, []);

  const requestTorrentPlayback = () => {
    setTorrentStarting(true);
    setTorrentLaunchError(null);
    setPlayerStatus('loading');
    setTorrentPlayRequest((request) => request + 1);
  };

  const seekTorrent = useCallback(
    async (positionSeconds: number, signal: AbortSignal) => {
      if (!torrentSession || !torrentPlayback || !activeTorrentId)
        throw new Error('Torrent unavailable');
      const updated = await replaceTorrentPlayback(torrentSession, positionSeconds, signal);
      signal.throwIfAborted();
      await queryClient.cancelQueries({
        queryKey: torrentSessionQueryKeys.session(accountKey, updated.id),
        exact: true,
      });
      signal.throwIfAborted();
      cacheTorrentSession(queryClient, accountKey, updated);
      setLaunchedTorrent({ accountKey, session: updated });
      return updated;
    },
    [accountKey, activeTorrentId, queryClient, torrentPlayback, torrentSession],
  );

  const resetPlayer = useCallback(() => {
    setTorrentSelected(false);
    setTorrentStarting(false);
    setTorrentLaunchError(null);
    if (mediaSession) {
      endSession();
    }
    if (!activeTorrentId && launchedTorrent?.accountKey === accountKey) {
      void stopTorrentSession(launchedTorrent.session.id, new AbortController().signal).catch(
        () => undefined,
      );
      setLaunchedTorrent(null);
    }

    setPlayerStatus('ready');
  }, [accountKey, activeTorrentId, endSession, launchedTorrent, mediaSession]);

  const selectPlaybackMode = (mode: PlaybackMode) => {
    if (mode === playbackMode) return;

    setPendingDirectEpisodeTransition(null);
    setSelectedPlaybackMode(mode);
    setIsPlaybackModeInitialized(true);
    resetPlayer();
  };

  const selectEmbedSource = (sourceRef: string | null) => {
    if (sourceRef === selectedEmbedSource?.sourceRef) return;

    setSelectedEmbedSourceRef(sourceRef);
    resetPlayer();
  };

  const startDirectPlayback = useCallback(
    (
      source: MediaSourceOption,
      episode: DirectEpisodeOption | undefined,
      positionSeconds: number,
    ) => {
      const episodeMetadata = findEpisodeMetadata(media, episode);

      startSession({
        mediaRef: media.mediaRef,
        mediaSnapshot: {
          title: media.title,
          slug: media.slug,
          artwork: media.poster,
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
    },
    [media, startSession, usesDirectEpisodes],
  );

  const selectDirectSource = (
    source: MediaSourceOption | undefined,
    continuePlayback = false,
    positionSeconds = mediaSession?.positionSeconds ?? 0,
    intent = mediaSession?.state,
  ) => {
    if (!source || source.sourceRef === selectedDirectSource?.sourceRef) return;

    setPendingDirectEpisodeTransition(null);
    setSelectedDirectSourceRef(source.sourceRef);
    if (continuePlayback && isPlayerStarted) {
      startDirectPlayback(source, selectedDirectEpisode, positionSeconds);
      if (intent === 'paused') pauseSession();
    } else {
      resetPlayer();
    }
  };

  const selectDirectEpisode = (episode: DirectEpisodeOption) => {
    setPendingDirectEpisodeTransition(null);
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
    selectDirectSource(getDirectQualityOptions(track?.sources ?? [])[0]?.source, continuePlayback);
  };

  const selectNextEpisode = () => {
    if (nextDirectEpisode) {
      setSelectedDirectEpisodeKey(nextDirectEpisode.key);
      setSelectedDirectSourceRef(null);
      setPendingDirectEpisodeTransition({
        episodeKey: nextDirectEpisode.key,
        trackKey: selectedDirectTrackKey ?? preferredDirectTrackKey,
        qualityKey: selectedDirectQualityKey,
        continuePlayback: isPlayerStarted,
      });
    }
  };

  useEffect(() => {
    if (
      !pendingDirectEpisodeTransition ||
      selectedDirectEpisode?.key !== pendingDirectEpisodeTransition.episodeKey
    ) {
      return;
    }

    const preferredSource = getAvailableDirectSourceForPlaybackPreference(
      currentDirectSources,
      pendingDirectEpisodeTransition.trackKey,
      pendingDirectEpisodeTransition.qualityKey,
    );

    if (!preferredSource && directModePending) return;

    const nextSource = preferredSource ?? getPreferredSource(currentDirectSources);

    setPendingDirectEpisodeTransition(null);

    if (!nextSource) {
      resetPlayer();
      return;
    }

    setSelectedDirectSourceRef(nextSource.sourceRef);

    if (pendingDirectEpisodeTransition.continuePlayback) {
      startDirectPlayback(nextSource, selectedDirectEpisode, 0);
    } else {
      resetPlayer();
    }
  }, [
    currentDirectSources,
    directModePending,
    pendingDirectEpisodeTransition,
    resetPlayer,
    selectedDirectEpisode,
    startDirectPlayback,
  ]);

  const loadPlayer = () => {
    if (!selectedSource || getMediaSourcePlaybackIssue(selectedSource)) {
      return;
    }

    const selectedEpisodeMetadata = findEpisodeMetadata(media, selectedDirectEpisode);

    startSession({
      mediaRef: media.mediaRef,
      mediaSnapshot: {
        title: media.title,
        slug: media.slug,
        artwork: media.poster,
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
    <div className="media-view grid min-w-0 items-start gap-8 xl:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)] xl:gap-10">
      <div className="media-view-playback order-2 min-w-0 space-y-8 xl:order-none xl:col-start-2 xl:row-start-1">
        <div className="min-w-0">
          <div className="media-player-frame min-w-0 overflow-visible rounded-card border border-context-border bg-surface shadow-surface">
            <div className="relative z-20 isolate">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-t-card bg-linear-to-br from-watermark/28 via-watermark/18 to-watermark/24"
              >
                <YaneMarkField />
                <YaneMark className="absolute -top-10 -right-12 size-56 rotate-[138deg] text-watermark opacity-[0.26]" />
                <div className="absolute inset-0 bg-linear-to-br from-transparent via-transparent to-watermark/8" />
              </div>
              <div className="media-player-toolbar relative z-10 grid min-w-0 grid-cols-2 gap-3 rounded-t-card bg-surface/70 px-4 py-3 sm:px-5 2xl:flex 2xl:flex-nowrap 2xl:items-center 2xl:gap-x-3">
                {isToolbarLoading ? (
                  <AvailabilityToolbarStatus hasEpisodeControls={showLocalEpisodeControls} />
                ) : (
                  <>
                    {showLocalEpisodeControls && animeSeasonSelector && (
                      <SeasonSelector
                        seasons={animeSeasonSelector.options}
                        selectedSeasonNumber={animeSeasonSelector.selectedSeasonNumber}
                        onSeasonChange={onAnimeSeasonChange}
                        variant="inline"
                        compactDesktop
                      />
                    )}

                    {showLocalEpisodeControls &&
                      !animeSeasonSelector &&
                      directSeasonNumbers.length > 0 && (
                        <SeasonSelector
                          seasons={directSeasons}
                          selectedSeasonNumber={selectedDirectEpisode?.seasonNumber ?? null}
                          onSeasonChange={selectSeason}
                          variant="inline"
                          compactDesktop
                        />
                      )}

                    {showLocalEpisodeControls && (
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

                    <div className="media-player-source-picker col-span-2 w-full 2xl:ml-auto 2xl:w-auto">
                      <PlaybackSourcePicker
                        embedSources={currentEmbedSources}
                        directSources={currentDirectSources}
                        selectedSource={selectedSource}
                        selectedDirectSource={selectedDirectSource}
                        selectedTrackKey={selectedDirectTrackKey}
                        onTorrentOpenChange={setTorrentOpen}
                        torrentPanel={(close) => (
                          <TorrentLaunch
                            selected={torrentSelected || !!activeTorrentId}
                            open={torrentOpen}
                            onOpenChange={setTorrentOpen}
                            mediaRef={media.mediaRef}
                            season={
                              usesEpisodePlayback(media)
                                ? selectedDirectEpisode?.seasonNumber
                                : undefined
                            }
                            episode={
                              usesEpisodePlayback(media) &&
                              selectedDirectEpisode?.seasonNumber !== undefined
                                ? selectedDirectEpisode.episodeNumber
                                : undefined
                            }
                            activeSession={torrentSession}
                            resumePositionSeconds={
                              continueWatchingEntries.find(
                                (entry) =>
                                  entry.mediaRef === media.mediaRef &&
                                  entry.sourceRef ===
                                    torrentPlaybackSourceRef(
                                      activeTorrentId ??
                                        (launchedTorrent?.accountKey === accountKey
                                          ? launchedTorrent.session.id
                                          : ''),
                                    ),
                              )?.positionSeconds ?? 0
                            }
                            playRequest={torrentPlayRequest}
                            onSourceSelect={() => {
                              if (mediaSession) endSession();
                              setTorrentStarting(true);
                              setTorrentLaunchError(null);
                              setPlayerStatus('loading');
                              setTorrentPlayRequest((request) => request + 1);
                              setTorrentSelected(true);
                              setTorrentOpen(false);
                              close();
                            }}
                            onPlaybackError={handleTorrentPlaybackError}
                            onPlaybackReady={handleTorrentReady}
                            onSessionChange={handleTorrentSessionChange}
                          />
                        )}
                        torrentOpen={torrentOpen}
                        onEmbedSelect={(sourceRef) => {
                          if (activeTorrentId || torrentSelected) resetPlayer();
                          if (playbackMode !== 'embed') selectPlaybackMode('embed');
                          selectEmbedSource(sourceRef);
                        }}
                        onDirectSelect={(trackKey) => {
                          if (activeTorrentId || torrentSelected) resetPlayer();
                          if (playbackMode !== 'direct') selectPlaybackMode('direct');
                          selectTrack(trackKey);
                        }}
                        onQualitySelect={(sourceRef) => {
                          if (activeTorrentId || torrentSelected) resetPlayer();
                          selectDirectSource(
                            currentDirectSources.find((source) => source.sourceRef === sourceRef),
                          );
                        }}
                        isLoading={sourcesPending && sourceSearchSettledMediaRef !== media.mediaRef}
                        align="end"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            <MediaPlayer
              mediaTitle={media.title}
              backdrop={media.backdrop}
              source={selectedSource?.url ? selectedSource : undefined}
              isStarted={isPlayerStarted}
              shouldAutoPlay={mediaSession?.state === 'playing'}
              initialPositionSeconds={mediaSession?.positionSeconds ?? 0}
              status={
                activeTorrentId && torrentUnavailable
                  ? 'error'
                  : activeTorrentId && !torrentPlayback
                    ? 'loading'
                    : playerStatus
              }
              onStart={torrentSelected ? requestTorrentPlayback : loadPlayer}
              onReady={handlePlayerReady}
              onError={handlePlayerError}
              onPlay={resumeSession}
              onPause={pauseSession}
              onProgress={updateProgress}
              onRetry={
                torrentSelected
                  ? requestTorrentPlayback
                  : activeTorrentId
                    ? () => void torrentQuery.refetch()
                    : loadPlayer
              }
              errorDescription={
                torrentLaunchError ?? (activeTorrentId ? torrentErrorDescription : undefined)
              }
              emptyState={playerEmptyState}
              embedded
              torrentTimeline={
                torrentPlayback
                  ? {
                      startPositionSeconds: torrentPlayback.startPositionSeconds,
                      durationSeconds: torrentPlayback.durationSeconds,
                      timeline: torrentPlayback.timeline,
                      playbackRates: torrentPlayback.playbackRates,
                      onSeek: seekTorrent,
                    }
                  : undefined
              }
              directControls={
                !activeTorrentId && selectedDirectSource
                  ? {
                      tracks: directTracks.map((track) => ({
                        value: track.key,
                        label: track.label,
                      })),
                      selectedTrackKey: selectedDirectTrackKey,
                      qualities: directQualities.map((quality) => ({
                        value: quality.key,
                        label: quality.label,
                      })),
                      selectedQualityKey: selectedDirectQualityKey,
                      onSelectionChange: (trackKey, qualityKey, position, intent) => {
                        if (trackKey) setPreferredDirectTrackKey(trackKey);
                        selectDirectSource(
                          getAvailableDirectSourceForPlaybackPreference(
                            currentDirectSources,
                            trackKey,
                            qualityKey,
                          ),
                          true,
                          position,
                          intent,
                        );
                      },
                      onNextEpisode: nextDirectEpisode ? selectNextEpisode : undefined,
                    }
                  : undefined
              }
            />
          </div>
        </div>

        {media.description && (
          <MediaDescriptionPanel className="hidden xl:block 2xl:hidden">
            <p className="mt-3 text-body text-text-secondary">{media.description}</p>
          </MediaDescriptionPanel>
        )}
        <UserRating media={media} embedded className="hidden sm:block 2xl:hidden" />
      </div>

      <div className="media-view-info contents xl:col-start-1 xl:row-start-1 xl:block">
        <MediaInfo
          media={media}
          variant="watch"
          actions={
            <FavoriteButton
              isFavorite={mediaIsFavorite}
              disabled={!canUpdateFavorites || isFavoriteUpdating(media.mediaRef)}
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
      </div>

      <section className="order-4 space-y-5 xl:hidden">
        {media.description && (
          <div className="sm:hidden">
            <MediaDescriptionPanel compact>
              <p
                className={[
                  'mt-2 text-body text-text-secondary',
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
            </MediaDescriptionPanel>
          </div>
        )}
        <UserRating media={media} embedded className="sm:hidden" />

        <MediaFacts media={media} className="grid gap-2 text-caption" showGenres={false} />
      </section>

      <div className="media-view-details order-4 hidden gap-8 2xl:col-span-2 2xl:grid 2xl:gap-10">
        {media.description && (
          <MediaDescriptionPanel>
            <p className="mt-3 max-w-5xl text-body text-text-secondary">{media.description}</p>
          </MediaDescriptionPanel>
        )}
        <UserRating media={media} embedded />
      </div>

      <MediaCommunity media={media} />

      <MediaCast persons={media.persons} className="order-7 xl:col-span-2" />
    </div>
  );
}
