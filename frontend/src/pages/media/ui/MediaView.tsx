import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/entities/auth';
import { SERVER_TORRENT_ENABLED } from '@/shared/config/serverTorrent';
import type { AnimeSeasonChainEntry, MediaDetails } from '@/entities/media';
import {
  getMediaSourcePlaybackIssue,
  mediaEpisodeAvailabilityQueryOptions,
  selectUsableAvailability,
  type MediaAvailability,
  type MediaSourceEpisodeRef,
  type MediaSourceOption,
} from '@/entities/media-source';
import {
  LOCAL_PLAYBACK_SOURCE_REF,
  isLocalPlaybackSourceRef,
  type PlaybackEpisodeSelection,
} from '@/entities/playback';
import {
  cacheTorrentSession,
  isTorrentPlaybackSourceRef,
  replaceTorrentPlayback,
  rememberTorrentAudio,
  switchTorrentFile,
  stopTorrentSession,
  torrentPlaybackSourceRef,
  torrentSessionQueryOptions,
  torrentSessionQueryKeys,
  type TorrentSession,
  type TorrentSessionState,
  TorrentRequestError,
} from '@/entities/torrent-session';
import { FavoriteButton, useFavorites } from '@/features/favorite';
import { usePlaybackSession, usePlayerPreferences } from '@/features/playback-session';
import { MediaCommunity } from '@/features/media-community';
import { UserRating } from '@/features/user-rating';
import { SeasonSelector } from '@/features/season-selection';
import {
  TorrentLaunch,
  LocalTorrentLaunch,
  useLocalTorrent,
  TorrentFilePicker,
  TorrentPreparation,
  torrentEpisodes,
  initialTorrentEpisode,
  type TorrentEpisode,
} from '@/features/torrent-launch';
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
  getPreferredSource,
  isDirectMediaSource,
  type DirectEpisodeOption,
  type PlaybackMode,
} from '@/features/source-selection';
import { MediaDescriptionPanel, MediaInfo } from '@/widgets/media-info';
import {
  MediaPlayer,
  type MediaPlayerEmptyState,
  type MediaPlayerStatus,
} from '@/widgets/media-player';
import { Button, Spinner, YaneMark, YaneMarkField } from '@/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { MediaAvailabilityStatus } from '../model/useMediaAvailability';
import { useMediaEpisodeAvailability } from '../model/useMediaEpisodeAvailability';
import { useMediaEpisodePrefetch } from '../model/useMediaEpisodePrefetch';
import { createAnimeSeasonSelectorState } from '../model/animeSeasonNavigation';
import { createPlayerEpisodeNavigation } from '../model/playerEpisodeNavigation';
import { torrentEpisodeNavigation } from '../model/torrentEpisodeNavigation';
import {
  createAnimePlaybackEpisodes,
  getAvailabilityEpisode,
  restoreAnimeEpisodeCoordinates,
  usesEpisodePlayback,
} from '../model/animeEpisodeAvailability';
import { resolveAvailablePlaybackMode } from '../model/playbackModeResolution';

export type MediaViewProps = {
  media: MediaDetails;
  animeSeasonChain: readonly AnimeSeasonChainEntry[];
  onAnimeSeasonChange: (seasonNumber: number) => void;
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
    <div
      className="media-player-loading flex w-full items-center justify-center"
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
  if (
    (['seasonNumber', 'episodeNumber', 'absoluteEpisodeNumber'] as const).some(
      (key) =>
        selection[key] !== undefined &&
        episode[key] !== undefined &&
        selection[key] !== episode[key],
    )
  )
    return false;

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

  // Catalog track IDs can differ from the resolved episode IDs. Once a
  // provider responds, its resolved variants replace its catalog placeholders.
  const confirmedProviders = new Set(exactSources.map((source) => source.provider));
  return [
    ...new Map(
      [
        ...baseSources.filter((source) => !confirmedProviders.has(source.provider)),
        ...exactSources,
      ].map((source) => [source.sourceRef, source]),
    ).values(),
  ];
}

function episodeEmbedSources(
  generic: readonly MediaSourceOption[],
  availability: MediaAvailability | null,
  selection: MediaSourceEpisodeRef | null,
) {
  const playerKey = (source: MediaSourceOption) => source.label.trim().toLowerCase();
  const genericPlayers = new Set(generic.map(playerKey));
  const usablePlayers = new Set(
    generic.filter((source) => !getMediaSourcePlaybackIssue(source)).map(playerKey),
  );
  const exact =
    availability && selection
      ? availability.episodes
          .filter((episode) => matchesEpisode(episode, selection))
          .flatMap((episode) => episode.sources)
          .filter(
            (source) =>
              source.kind === 'embed' &&
              (!genericPlayers.has(playerKey(source)) ||
                (!usablePlayers.has(playerKey(source)) && !getMediaSourcePlaybackIssue(source))),
          )
      : [];
  const replacements = new Set(exact.map(playerKey));
  return [...generic.filter((source) => !replacements.has(playerKey(source))), ...exact];
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
  initialAnimeEpisodeNumber,
  availability,
  availabilityPending,
  availabilityStatus,
}: MediaViewProps) {
  const {
    session,
    continueWatchingEntries,
    status: progressStatus,
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
  const playbackIntentRef = useRef(mediaSession?.state);
  playbackIntentRef.current = mediaSession?.state;
  const storedProgress =
    mediaSession ?? continueWatchingEntries.find((entry) => entry.mediaRef === media.mediaRef);
  const currentAnimeSeason = animeSeasonChain.find((season) => season.mediaRef === media.mediaRef);
  const savedEpisode =
    media.type === 'anime'
      ? restoreAnimeEpisodeCoordinates(storedProgress?.episode ?? null, currentAnimeSeason)
      : storedProgress?.episode;
  const savedProgress =
    storedProgress && savedEpisode !== storedProgress.episode
      ? { ...storedProgress, episode: savedEpisode ?? null }
      : storedProgress;
  const preferences = usePlayerPreferences();
  const { state: authState } = useAuth();
  const accountKey = authState.status === 'authenticated' ? authState.user.email : authState.status;
  const queryClient = useQueryClient();
  const [torrentOpen, setTorrentOpen] = useState(false);
  const local = useLocalTorrent();
  const stopLocal = local.stop;
  const [localSelected, setLocalSelected] = useState(
    !SERVER_TORRENT_ENABLED && isLocalPlaybackSourceRef(savedProgress?.sourceRef ?? ''),
  );
  const [localPaused, setLocalPaused] = useState(false);
  const localAutoSession = useRef<string | null>(null);
  const localChoiceMade = useRef(false);
  const localConfirmedBinding = useRef<typeof local.playback>(null);
  const localBinding = useRef(local.playback);
  localBinding.current = local.playback;
  const localScope = `${accountKey}:${media.mediaRef}`;
  const currentLocalScope = useRef(localScope);
  currentLocalScope.current = localScope;
  const currentMediaSession = useRef(mediaSession);
  currentMediaSession.current = mediaSession;
  useEffect(
    () => () => {
      const current = currentMediaSession.current;
      if (current && isLocalPlaybackSourceRef(current.sourceRef)) pauseSession(current);
    },
    [localScope, pauseSession],
  );
  const [torrentSelected, setTorrentSelected] = useState(false);
  const [torrentPlayRequest, setTorrentPlayRequest] = useState(0);
  const [torrentStarting, setTorrentStarting] = useState(false);
  const [torrentPreparationState, setTorrentPreparationState] =
    useState<TorrentSessionState | null>(null);
  const [torrentLaunchError, setTorrentLaunchError] = useState<string | null>(null);
  const [torrentNeedsFile, setTorrentNeedsFile] = useState(false);
  const [torrentRequestedFileRef, setTorrentRequestedFileRef] = useState<string | null>(null);
  const [torrentSwitching, setTorrentSwitching] = useState(false);
  const [torrentSourceRevision, setTorrentSourceRevision] = useState(0);
  const torrentSwitchRef = useRef<AbortController | null>(null);
  const torrentResumeRef = useRef<{
    episode: PlaybackEpisodeSelection | null;
    position: number;
    paused: boolean;
  } | null>(null);
  const torrentScopeRef = useRef(`${accountKey}:${media.mediaRef}`);
  useEffect(() => {
    const scope = `${accountKey}:${media.mediaRef}`;
    if (torrentScopeRef.current === scope) return;
    torrentScopeRef.current = scope;
    stopLocal();
    setLocalSelected(false);
    setLocalPaused(false);
    localChoiceMade.current = false;
    localConfirmedBinding.current = null;
    localAutoSession.current = null;
    torrentSwitchRef.current?.abort();
    torrentSwitchRef.current = null;
    torrentResumeRef.current = null;
    setTorrentSwitching(false);
    setTorrentNeedsFile(false);
    setTorrentRequestedFileRef(null);
    setTorrentSelected(false);
    setTorrentStarting(false);
  }, [accountKey, media.mediaRef, stopLocal]);
  useEffect(() => {
    if (
      !SERVER_TORRENT_ENABLED &&
      !localChoiceMade.current &&
      isLocalPlaybackSourceRef(savedProgress?.sourceRef ?? '')
    )
      setLocalSelected(true);
  }, [localScope, savedProgress?.sourceRef]);
  useEffect(() => {
    if (
      localSelected &&
      !local.playback &&
      !local.pending &&
      mediaSession &&
      isLocalPlaybackSourceRef(mediaSession.sourceRef)
    )
      pauseSession(mediaSession);
  }, [localSelected, local.playback, local.pending, mediaSession, pauseSession]);
  const [launchedTorrent, setLaunchedTorrent] = useState<{
    accountKey: string;
    session: TorrentSession;
  } | null>(null);
  const savedTorrentId =
    SERVER_TORRENT_ENABLED && mediaSession && isTorrentPlaybackSourceRef(mediaSession.sourceRef)
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
    : torrentSelected && launchedTorrent?.accountKey === accountKey
      ? launchedTorrent.session
      : null;
  const [readyTorrent, setReadyTorrent] = useState<{
    accountKey: string;
    session: TorrentSession;
  } | null>(null);
  useEffect(() => {
    if (!torrentSwitching && torrentSession?.state === 'ready' && torrentSession.playback)
      setReadyTorrent({ accountKey, session: torrentSession });
  }, [accountKey, torrentSession, torrentSwitching]);
  const torrentEnded =
    torrentQuery.isError &&
    torrentQuery.error instanceof TorrentRequestError &&
    torrentQuery.error.status === 404;
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
    torrentSwitching &&
    readyTorrent?.accountKey === accountKey &&
    readyTorrent.session.id === activeTorrentId
      ? readyTorrent.session.playback
      : !torrentEnded && torrentSession?.state === 'ready'
        ? torrentSession.playback
        : !torrentEnded &&
            (torrentSession?.state === 'preparing' || torrentSwitching) &&
            readyTorrent?.accountKey === accountKey &&
            readyTorrent.session.id === activeTorrentId &&
            (torrentSwitching ||
              readyTorrent.session.selectedFileRef === torrentSession?.selectedFileRef)
          ? readyTorrent.session.playback
          : null;
  const torrentUnavailable =
    !torrentSwitching &&
    (torrentQuery.isError ||
      (torrentSession !== null &&
        ['failed', 'awaiting_playback', 'awaiting_file'].includes(torrentSession.state)));
  const torrentErrorDescription = torrentQuery.isError
    ? 'Не удалось связаться с торрент-сервисом. Проверьте подключение и повторите попытку.'
    : torrentSession?.failure?.code === 'TORRENT_TRANSCODE_FAILED'
      ? 'Не удалось преобразовать видео для браузера. Попробуйте другой файл.'
      : torrentSession?.failure?.code === 'TORRENT_PLAYBACK_TIMEOUT'
        ? 'Видео слишком медленно загружается от участников. Попробуйте позже.'
        : torrentSession?.failure?.code === 'TORRENT_UNSUPPORTED_MEDIA'
          ? 'Видео не поддерживается. Выберите SDR-файл до 1080p; HDR и 4K пока недоступны.'
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
  const animeReleaseCoordinates =
    media.type === 'anime'
      ? (currentAnimeSeason ?? {
          number: 1,
          seasonEpisodeOffset: 0,
          absoluteEpisodeOffset: 0,
        })
      : undefined;
  const torrentFiles = torrentEpisodes(torrentSession?.files ?? [], media, currentAnimeSeason);
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
    (source) => source.sourceRef === savedProgress?.sourceRef,
  );
  const sessionDirectEpisode = usesDirectEpisodes
    ? (findDirectEpisodeBySourceRef(directEpisodes, savedProgress?.sourceRef) ??
      findDirectEpisodeByRef(directEpisodes, savedProgress?.episode))
    : undefined;
  const sessionDirectSource = usesDirectEpisodes
    ? sessionDirectEpisode?.sources.find((source) => source.sourceRef === savedProgress?.sourceRef)
    : catalog.directSources.find((source) => source.sourceRef === savedProgress?.sourceRef);

  const initialMode: PlaybackMode = sessionEmbedSource
    ? 'embed'
    : sessionDirectSource || (sessionDirectEpisode && savedProgress)
      ? 'direct'
      : hasInitialEmbedMode
        ? 'embed'
        : 'direct';
  const requestedAnimeEpisode =
    media.type === 'anime' && initialAnimeEpisodeNumber !== undefined
      ? directEpisodes.find(({ episodeNumber }) => episodeNumber === initialAnimeEpisodeNumber)
      : undefined;
  const initialDirectEpisode =
    sessionDirectEpisode ??
    requestedAnimeEpisode ??
    directEpisodes.find((episode) => (episode.seasonNumber ?? 1) > 0) ??
    directEpisodes[0];
  const initialDirectSources = usesDirectEpisodes
    ? (initialDirectEpisode?.sources ?? [])
    : catalog.directSources;

  const [selectedPlaybackMode, setSelectedPlaybackMode] = useState<PlaybackMode>(initialMode);
  const [isPlaybackModeInitialized, setIsPlaybackModeInitialized] = useState(
    hasInitialPlaybackSources && progressStatus === 'ready',
  );
  const [selectedEmbedSourceRef, setSelectedEmbedSourceRef] = useState<string | null>(
    sessionEmbedSource?.sourceRef ?? getPreferredSource(catalog.embedSources)?.sourceRef ?? null,
  );
  const [selectedDirectEpisodeKey, setSelectedDirectEpisodeKey] = useState<string | null>(
    progressStatus === 'ready' ? (initialDirectEpisode?.key ?? null) : null,
  );
  const [selectedDirectSourceRef, setSelectedDirectSourceRef] = useState<string | null>(
    progressStatus !== 'ready'
      ? null
      : (sessionDirectSource?.sourceRef ??
          (sessionDirectEpisode && mediaSession ? mediaSession.sourceRef : undefined) ??
          getPreferredSource(initialDirectSources)?.sourceRef ??
          null),
  );
  const [preferredDirectTrackKey, setPreferredDirectTrackKey] = useState<string | null>(
    sessionDirectSource && progressStatus === 'ready'
      ? getDirectTrackKey(sessionDirectSource)
      : null,
  );
  const episodeRequestRef = useRef<AbortController | null>(null);
  const userEpisodeSelectionRef = useRef(false);
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
  const {
    availability: episodeAvailability,
    isPending: episodeAvailabilityPending,
    retry: retryEpisodeAvailability,
  } = useMediaEpisodeAvailability(media.mediaRef, availabilityEpisode);
  const currentEmbedSources = episodeEmbedSources(
    catalog.embedSources,
    episodeAvailability,
    availabilityEpisode,
  );
  const hasEmbedMode = currentEmbedSources.length > 0;
  const selectedEmbedSource =
    currentEmbedSources.find((source) => source.sourceRef === selectedEmbedSourceRef) ??
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
  const usesPlayerEpisodes = playbackMode === 'direct' && usesDirectEpisodes;
  const directModePending = usesDirectEpisodes && episodeAvailabilityPending;
  const sourcesPending = availabilityPending || directModePending;
  const hasToolbarControls = hasPlaybackSources && (media.type === 'movie' || usesDirectEpisodes);
  const initialToolbarLoadComplete = hasToolbarControls || !sourcesPending;
  const isToolbarLoading =
    !localSelected && toolbarResolvedMediaRef !== media.mediaRef && !initialToolbarLoadComplete;
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
    if (progressStatus !== 'ready') return;
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
    progressStatus,
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

  const catalogDirectSource = selectedDirectEpisode?.sources.find(
    (source) => source.sourceRef === selectedDirectSourceRef,
  );
  const selectedDirectSource =
    currentDirectSources.find((source) => source.sourceRef === selectedDirectSourceRef) ??
    currentDirectSources.find((source) => source.sourceRef === savedProgress?.sourceRef) ??
    getPreferredSource(
      currentDirectSources.filter(
        (source) => source.provider === (catalogDirectSource ?? sessionDirectSource)?.provider,
      ),
    ) ??
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

    if (selectedDirectEpisodeKey === null && selectedDirectEpisode && progressStatus === 'ready') {
      setSelectedDirectEpisodeKey(selectedDirectEpisode.key);
    }

    if (selectedDirectSourceRef === null && selectedDirectSource && progressStatus === 'ready') {
      setSelectedDirectSourceRef(selectedDirectSource.sourceRef);
    }

    if (
      preferredDirectTrackKey === null &&
      selectedDirectTrackKey !== null &&
      progressStatus === 'ready'
    ) {
      setPreferredDirectTrackKey(selectedDirectTrackKey);
    }
  }, [
    preferredDirectTrackKey,
    progressStatus,
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

  const localFiles = torrentEpisodes(
    (local.snapshot?.files ?? [])
      .filter((file) => /\.(mkv|mp4|m4v|avi|mov|ts|webm)$/i.test(file.name) && file.size > 0)
      .map((file) => ({ ref: file.fileRef, name: file.name, sizeBytes: file.size })),
    media,
    currentAnimeSeason,
  );
  const selectedSource: MediaSourceOption | undefined = localSelected
    ? {
        sourceRef: `local:${local.playback?.source.id ?? 'selection'}`,
        provider: 'torrent',
        kind: 'hls',
        label: 'Торрент · на устройстве',
        url: local.playback?.source.url ?? '',
        availability: 'available',
        browserSupported: true,
      }
    : activeTorrentId || torrentSelected
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

  const providerDirectSources = currentDirectSources.filter(
    (source) => source.provider === selectedDirectSource?.provider,
  );
  const directTracks = getDirectTrackOptions(providerDirectSources);
  const selectedDirectTrack = directTracks.find((track) => track.key === selectedDirectTrackKey);
  const directQualities = getDirectQualityOptions(selectedDirectTrack?.sources ?? []);
  const selectedDirectQualityKey = selectedDirectSource
    ? getDirectQualityKey(selectedDirectSource)
    : null;

  const selectedPlaybackEpisode = usesPlayerEpisodes
    ? getPlaybackEpisode(selectedDirectEpisode)
    : null;
  const sessionPlaybackEpisode = mediaSession?.episode ?? null;
  const sessionCatalogSource = selectedDirectEpisode?.sources.find(
    (source) => source.sourceRef === mediaSession?.sourceRef,
  );
  const sessionSourceMatches =
    mediaSession?.sourceRef === selectedSourceRef ||
    (usesPlayerEpisodes &&
      sessionCatalogSource !== undefined &&
      sessionCatalogSource.provider === selectedDirectSource?.provider);
  const isPlayerStarted =
    localSelected || activeTorrentId !== null || torrentStarting
      ? true
      : sessionSourceMatches &&
        (!usesPlayerEpisodes || hasSameEpisode(sessionPlaybackEpisode, selectedPlaybackEpisode));
  // Catalog episode URLs may still be redirectors. The episode lookup confirms
  // the playback URL, including progressive results from that lookup.
  const directSourceUnconfirmed =
    usesPlayerEpisodes &&
    !localSelected &&
    !activeTorrentId &&
    !torrentSelected &&
    !mergeEpisodeSources([], episodeAvailability, availabilityEpisode).some(
      (source) => source.sourceRef === selectedDirectSource?.sourceRef,
    );

  useEffect(
    () => () => episodeRequestRef.current?.abort(),
    [accountKey, media.mediaRef, selectedSourceRef],
  );

  const handleTorrentReady = useCallback(
    (ready: TorrentSession, episode?: PlaybackEpisodeSelection | null) => {
      if (!ready.playback) return;
      const resolvedEpisode =
        episode ??
        torrentEpisodes(ready.files, media, currentAnimeSeason).find(
          (row) => row.file.ref === ready.selectedFileRef,
        )?.episode ??
        null;
      const paused = torrentResumeRef.current?.paused ?? false;
      torrentResumeRef.current = {
        episode: resolvedEpisode,
        position: ready.playback.startPositionSeconds,
        paused,
      };
      setTorrentStarting(false);
      setTorrentNeedsFile(false);
      setTorrentRequestedFileRef(null);
      setTorrentLaunchError(null);
      setLaunchedTorrent({ accountKey, session: ready });
      setReadyTorrent({ accountKey, session: ready });
      startSession({
        mediaRef: media.mediaRef,
        mediaSnapshot: {
          title: media.title,
          slug: media.slug,
          artwork: media.poster,
        },
        sourceRef: torrentPlaybackSourceRef(ready.id),
        episode: resolvedEpisode,
        positionSeconds: ready.playback.startPositionSeconds,
        durationSeconds: ready.playback.durationSeconds,
      });
      if (paused) pauseSession();
      setPlayerStatus('loading');
    },
    [accountKey, currentAnimeSeason, media, pauseSession, startSession],
  );

  const handleTorrentSessionChange = useCallback(
    (updated: TorrentSession | null) => {
      setLaunchedTorrent(updated ? { accountKey, session: updated } : null);
      if (!updated) {
        setTorrentSelected(false);
        setTorrentStarting(false);
        setTorrentNeedsFile(false);
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
    torrentResumeRef.current ??= {
      episode: savedProgress?.episode ?? null,
      position: savedProgress?.positionSeconds ?? 0,
      paused: mediaSession?.state === 'paused',
    };
    setTorrentStarting(true);
    setTorrentPreparationState('created');
    setTorrentLaunchError(null);
    setPlayerStatus('loading');
    setTorrentPlayRequest((request) => request + 1);
  };

  const replaceTorrent = useCallback(
    async (positionSeconds: number, signal: AbortSignal, audioTrackRef?: string) => {
      if (!torrentSession || !torrentPlayback || !activeTorrentId)
        throw new Error('Torrent unavailable');
      const updated = await replaceTorrentPlayback(
        torrentSession,
        positionSeconds,
        signal,
        audioTrackRef,
      );
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
    localChoiceMade.current = true;
    stopLocal();
    setLocalSelected(false);
    episodeRequestRef.current?.abort();
    setTorrentSourceRevision((revision) => revision + 1);
    torrentSwitchRef.current?.abort();
    torrentSwitchRef.current = null;
    setTorrentSwitching(false);
    setTorrentNeedsFile(false);
    setTorrentRequestedFileRef(null);
    torrentResumeRef.current = null;
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
  }, [accountKey, activeTorrentId, endSession, launchedTorrent, mediaSession, stopLocal]);

  useEffect(() => () => torrentSwitchRef.current?.abort(), [accountKey, media.mediaRef]);

  const selectTorrentEpisode = async (row: TorrentEpisode, hostSignal: AbortSignal) => {
    hostSignal.throwIfAborted();
    if (!torrentSession || row.file.ref === readyTorrent?.session.selectedFileRef) return;
    torrentSwitchRef.current?.abort();
    const request = new AbortController();
    torrentSwitchRef.current = request;
    const signal = AbortSignal.any([hostSignal, request.signal]);
    setTorrentSwitching(true);
    const audio = torrentPlayback?.audioTracks.find(
      (track) => track.ref === torrentPlayback.selectedAudioTrackRef,
    );
    if (audio) rememberTorrentAudio(audio);
    try {
      await queryClient.cancelQueries({
        queryKey: torrentSessionQueryKeys.session(accountKey, torrentSession.id),
        exact: true,
      });
      const updated = await switchTorrentFile(torrentSession, row.file.ref, 0, signal);
      signal.throwIfAborted();
      await queryClient.cancelQueries({
        queryKey: torrentSessionQueryKeys.session(accountKey, updated.id),
        exact: true,
      });
      signal.throwIfAborted();
      torrentResumeRef.current = {
        episode: row.episode,
        position: 0,
        paused: playbackIntentRef.current === 'paused',
      };
      cacheTorrentSession(queryClient, accountKey, updated);
      handleTorrentReady(updated, row.episode);
    } catch (error) {
      if (!signal.aborted) {
        setTorrentLaunchError('Не удалось переключить серию. Повторите выбор файла.');
        setTorrentNeedsFile(true);
        void torrentQuery.refetch();
      }
      throw error;
    } finally {
      if (torrentSwitchRef.current === request) {
        torrentSwitchRef.current = null;
        setTorrentSwitching(false);
      }
    }
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

  const startDirectPlayback = useCallback(
    (
      source: MediaSourceOption,
      episode: DirectEpisodeOption | undefined,
      positionSeconds: number,
    ) => {
      const episodeMetadata = findEpisodeMetadata(media, episode);
      userEpisodeSelectionRef.current = false;

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
    continuePlayback = true,
    positionSeconds = mediaSession?.positionSeconds ?? 0,
    intent = mediaSession?.state,
  ) => {
    if (!source || source.sourceRef === selectedDirectSource?.sourceRef) return;

    episodeRequestRef.current?.abort();
    setSelectedDirectSourceRef(source.sourceRef);
    if (continuePlayback && isPlayerStarted) {
      startDirectPlayback(source, selectedDirectEpisode, positionSeconds);
      if (intent === 'paused') pauseSession();
    } else {
      resetPlayer();
    }
  };

  const selectDirectEpisode = async (episode: DirectEpisodeOption, hostSignal: AbortSignal) => {
    hostSignal.throwIfAborted();
    if (episode.key === selectedDirectEpisode?.key) return;
    episodeRequestRef.current?.abort();
    const request = new AbortController();
    episodeRequestRef.current = request;
    const signal = AbortSignal.any([hostSignal, request.signal]);
    const coordinates = getAvailabilityEpisode(media, episode);
    if (!coordinates) {
      episodeRequestRef.current = null;
      throw new Error('Серия недоступна');
    }
    const options = mediaEpisodeAvailabilityQueryOptions(queryClient, media.mediaRef, coordinates);
    const cancel = () => {
      const query = queryClient.getQueryCache().find({ queryKey: options.queryKey, exact: true });
      if (query?.getObserversCount() === 0)
        void queryClient.cancelQueries({ queryKey: options.queryKey, exact: true });
    };
    signal.addEventListener('abort', cancel, { once: true });
    const candidates = (resolved: MediaAvailability | null) =>
      mergeEpisodeSources([], resolved, coordinates).filter(
        (source) =>
          source.provider === selectedDirectSource?.provider &&
          !getMediaSourcePlaybackIssue(source),
      );
    const preferred = (sources: readonly MediaSourceOption[]) =>
      getAvailableDirectSourceForPlaybackPreference(
        sources,
        selectedDirectTrackKey ?? preferredDirectTrackKey,
        selectedDirectQualityKey,
      );
    try {
      const cached = queryClient.getQueryData(options.queryKey);
      let sources = candidates(cached ? selectUsableAvailability(cached.availability) : null);
      let source = preferred(sources);
      if (!source) {
        const result = await queryClient.fetchQuery({ ...options, staleTime: 0, retry: false });
        signal.throwIfAborted();
        sources = candidates(selectUsableAvailability(result.availability));
        source = preferred(sources) ?? getPreferredSource(sources);
      }
      signal.throwIfAborted();
      if (!source) throw new Error('Для этой серии пока нет доступного источника');
      userEpisodeSelectionRef.current = true;
      setIsPlaybackModeInitialized(true);
      setSelectedPlaybackMode(playbackMode);
      setSelectedDirectEpisodeKey(episode.key);
      setSelectedDirectSourceRef(source.sourceRef);
      episodeRequestRef.current = null;
      if (isPlayerStarted) {
        startDirectPlayback(source, episode, 0);
        if (playbackIntentRef.current === 'paused') pauseSession();
      } else resetPlayer();
    } finally {
      signal.removeEventListener('abort', cancel);
      if (episodeRequestRef.current === request) episodeRequestRef.current = null;
    }
  };

  const selectDirectProvider = (provider: string) => {
    const sources = currentDirectSources.filter((source) => source.provider === provider);
    const source =
      getAvailableDirectSourceForPlaybackPreference(
        sources,
        preferredDirectTrackKey,
        selectedDirectQualityKey,
      ) ?? getPreferredSource(sources);
    if (!source) return;
    setPreferredDirectTrackKey(getDirectTrackKey(source));
    selectDirectSource(source);
  };

  const selectLocalFile = async (fileRef: string, signal?: AbortSignal) => {
    setPlayerStatus('loading');
    const row = localFiles.find((row) => row.file.ref === fileRef);
    const resume =
      row &&
      !row.ambiguous &&
      !row.supplemental &&
      savedProgress &&
      (usesEpisodePlayback(media)
        ? row.episode !== null && hasSameEpisode(row.episode, savedProgress.episode)
        : true);
    try {
      await local.prepare(fileRef, resume ? savedProgress.positionSeconds : 0, signal);
      if (!signal?.aborted) setTorrentOpen(false);
    } catch {
      // The hook publishes a friendly error only for the current selection.
    }
  };
  useEffect(() => {
    if (
      !localSelected ||
      !local.snapshot ||
      local.snapshot.state !== 'awaiting_file' ||
      local.pending ||
      progressStatus === 'loading' ||
      localAutoSession.current === local.snapshot.sessionId
    )
      return;
    localAutoSession.current = local.snapshot.sessionId;
    const row = initialTorrentEpisode(
      localFiles,
      savedProgress?.episode ?? selectedPlaybackEpisode,
      media.type === 'movie' || (media.type === 'anime' && media.animeKind === 'movie'),
    );
    if (row) void selectLocalFile(row.file.ref);
  });
  const playerNavigation = localSelected
    ? {
        ...torrentEpisodeNavigation(
          localFiles,
          local.snapshot?.selectedFileRef ?? null,
          media.type !== 'series',
          async (row, signal) => {
            await local.prepare(row.file.ref, 0, signal);
          },
        ),
        pending: local.pending,
      }
    : (activeTorrentId || torrentSelected) && torrentFiles.length > 1
      ? {
          ...torrentEpisodeNavigation(
            torrentFiles,
            torrentSwitching
              ? (readyTorrent?.session.selectedFileRef ?? null)
              : (torrentSession?.selectedFileRef ?? null),
            media.type !== 'series',
            selectTorrentEpisode,
          ),
          pending: torrentSwitching,
        }
      : usesPlayerEpisodes && !activeTorrentId && !torrentSelected
        ? createPlayerEpisodeNavigation(
            directEpisodes,
            selectedDirectEpisode,
            media.type === 'anime' ||
              directEpisodes.every((episode) => episode.seasonNumber === undefined),
            selectDirectEpisode,
          )
        : undefined;

  const loadPlayer = () => {
    localChoiceMade.current = true;
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
      positionSeconds:
        savedProgress &&
        !userEpisodeSelectionRef.current &&
        hasSameEpisode(savedProgress.episode, selectedPlaybackEpisode)
          ? savedProgress.positionSeconds
          : 0,
      durationSeconds:
        selectedSource.kind === 'hls' || selectedSource.kind === 'mp4'
          ? selectedEpisodeMetadata?.runtimeMinutes !== undefined
            ? selectedEpisodeMetadata.runtimeMinutes * 60
            : media.runtimeMinutes !== undefined
              ? media.runtimeMinutes * 60
              : null
          : null,
    });
    userEpisodeSelectionRef.current = false;
    const canLoadSource =
      (selectedSource.kind === 'embed' ||
        selectedSource.kind === 'hls' ||
        selectedSource.kind === 'mp4') &&
      !getMediaSourcePlaybackIssue(selectedSource);

    setPlayerStatus(canLoadSource ? 'loading' : 'ready');
  };

  const handlePlayerReady = useCallback(() => {
    setPlayerStatus('ready');
  }, []);

  const handlePlayerError = useCallback(() => {
    setPlayerStatus('error');
  }, []);

  return (
    <div className="media-view-container">
      <div className={`media-view${media.description ? ' media-view-with-description' : ''}`}>
        <div className="media-view-info min-w-0">
          <MediaInfo
            media={media}
            variant="watch"
            ratings={<UserRating media={media} compact />}
            navigation={
              animeSeasonSelector && (
                <SeasonSelector
                  seasons={animeSeasonSelector.options}
                  selectedSeasonNumber={animeSeasonSelector.selectedSeasonNumber}
                  onSeasonChange={onAnimeSeasonChange}
                  variant="inline"
                />
              )
            }
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

        <div className="media-view-playback min-w-0">
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
                <div className="media-player-toolbar relative z-10 flex min-w-0 flex-wrap items-center gap-3 rounded-t-card bg-surface/70 px-4 py-3">
                  {isToolbarLoading ? (
                    <AvailabilityToolbarStatus />
                  ) : (
                    <>
                      <div className="media-player-source-picker min-w-0">
                        <PlaybackSourcePicker
                          embedSources={currentEmbedSources}
                          directSources={currentDirectSources}
                          selectedSource={selectedSource}
                          onTorrentOpenChange={setTorrentOpen}
                          torrentPanel={
                            SERVER_TORRENT_ENABLED
                              ? (close) => (
                                  <TorrentLaunch
                                    sourceRevision={torrentSourceRevision}
                                    media={media}
                                    animeRelease={currentAnimeSeason}
                                    requestedEpisode={
                                      torrentResumeRef.current?.episode ??
                                      savedProgress?.episode ??
                                      null
                                    }
                                    requestedFileRef={torrentRequestedFileRef}
                                    onFileSelectionRequired={() => setTorrentNeedsFile(true)}
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
                                      torrentResumeRef.current?.position ??
                                      savedProgress?.positionSeconds ??
                                      0
                                    }
                                    playRequest={torrentPlayRequest}
                                    onSourceSelect={() => {
                                      torrentSwitchRef.current?.abort();
                                      torrentResumeRef.current = {
                                        episode:
                                          savedProgress?.episode ??
                                          (userEpisodeSelectionRef.current ||
                                          initialAnimeEpisodeNumber !== undefined
                                            ? getPlaybackEpisode(selectedDirectEpisode)
                                            : null),
                                        position: savedProgress?.positionSeconds ?? 0,
                                        paused: mediaSession?.state === 'paused',
                                      };
                                      setTorrentRequestedFileRef(null);
                                      setTorrentNeedsFile(false);
                                      if (mediaSession) endSession();
                                      setTorrentStarting(true);
                                      setTorrentPreparationState(null);
                                      setTorrentLaunchError(null);
                                      setPlayerStatus('loading');
                                      setTorrentPlayRequest((request) => request + 1);
                                      setTorrentSelected(true);
                                      setTorrentOpen(false);
                                      close();
                                    }}
                                    onPlaybackError={handleTorrentPlaybackError}
                                    onPreparationChange={setTorrentPreparationState}
                                    onPlaybackReady={handleTorrentReady}
                                    onSessionChange={handleTorrentSessionChange}
                                  />
                                )
                              : () => (
                                  <LocalTorrentLaunch
                                    local={local}
                                    onStart={() => {
                                      localChoiceMade.current = true;
                                      localConfirmedBinding.current = null;
                                      episodeRequestRef.current?.abort();
                                      endSession();
                                      setLocalSelected(true);
                                      setLocalPaused(false);
                                      setPlayerStatus('loading');
                                    }}
                                    onSelect={(fileRef) => void selectLocalFile(fileRef)}
                                    onStop={resetPlayer}
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
                                  />
                                )
                          }
                          torrentOpen={torrentOpen}
                          onEmbedSelect={(sourceRef) => {
                            if (localSelected || activeTorrentId || torrentSelected) resetPlayer();
                            if (playbackMode !== 'embed') selectPlaybackMode('embed');
                            selectEmbedSource(sourceRef);
                          }}
                          onDirectSelect={(provider) => {
                            if (localSelected || activeTorrentId || torrentSelected) resetPlayer();
                            if (playbackMode !== 'direct') selectPlaybackMode('direct');
                            selectDirectProvider(provider);
                          }}
                          isLoading={
                            sourcesPending && sourceSearchSettledMediaRef !== media.mediaRef
                          }
                          align="end"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>

              <MediaPlayer
                key={accountKey}
                preferences={preferences}
                localPlayback={localSelected ? (local.playback ?? undefined) : undefined}
                navigation={playerNavigation}
                loading={
                  localSelected && !local.playback ? (
                    <Spinner
                      label={
                        local.pending
                          ? 'Подготавливаем локальное видео'
                          : 'Выберите файл в меню источника'
                      }
                    />
                  ) : torrentSelected || activeTorrentId ? (
                    <TorrentPreparation
                      key={torrentPlayRequest}
                      state={torrentPreparationState ?? torrentSession?.state}
                    />
                  ) : undefined
                }
                selection={
                  localSelected && !local.snapshot && !local.pending && !local.error ? (
                    <div className="space-y-3 text-white" role="status">
                      <p>Выберите раздачу для продолжения просмотра</p>
                      <p className="text-caption text-white/70">Серия и позиция сохранены.</p>
                      <Button onClick={() => setTorrentOpen(true)}>Выбрать раздачу</Button>
                    </div>
                  ) : localSelected &&
                    local.snapshot &&
                    !local.playback &&
                    !local.pending &&
                    !local.error ? (
                    <TorrentFilePicker
                      files={localFiles}
                      missing={false}
                      onSelect={(fileRef) => void selectLocalFile(fileRef)}
                    />
                  ) : torrentNeedsFile ? (
                    <TorrentFilePicker
                      files={torrentFiles}
                      missing={!!torrentResumeRef.current?.episode}
                      onSelect={(fileRef) => {
                        setTorrentRequestedFileRef(fileRef);
                        setTorrentNeedsFile(false);
                        requestTorrentPlayback();
                      }}
                    />
                  ) : undefined
                }
                mediaTitle={media.title}
                backdrop={media.backdrop}
                source={
                  selectedSource?.url && (!isPlayerStarted || !directSourceUnconfirmed)
                    ? selectedSource
                    : undefined
                }
                isStarted={isPlayerStarted}
                shouldAutoPlay={localSelected ? !localPaused : mediaSession?.state === 'playing'}
                initialPositionSeconds={
                  localSelected
                    ? (local.playback?.position ?? 0)
                    : (mediaSession?.positionSeconds ?? 0)
                }
                status={
                  localSelected
                    ? local.error
                      ? 'error'
                      : local.pending || !local.playback
                        ? 'loading'
                        : playerStatus
                    : activeTorrentId && torrentUnavailable
                      ? 'error'
                      : activeTorrentId && !torrentPlayback
                        ? 'loading'
                        : directSourceUnconfirmed && isPlayerStarted
                          ? episodeAvailabilityPending
                            ? 'loading'
                            : 'error'
                          : playerStatus
                }
                onStart={torrentSelected ? requestTorrentPlayback : loadPlayer}
                onReady={handlePlayerReady}
                onError={handlePlayerError}
                onPlay={() => {
                  if (localSelected) {
                    setLocalPaused(false);
                    if (
                      local.playback &&
                      !local.playback.signal.aborted &&
                      localConfirmedBinding.current === local.playback &&
                      currentLocalScope.current === localScope
                    )
                      resumeSession();
                    return;
                  }
                  if (mediaSession && !torrentSwitchRef.current) resumeSession(mediaSession);
                }}
                onPause={() => {
                  if (localSelected) {
                    if (!local.pending) {
                      setLocalPaused(true);
                      if (
                        local.playback &&
                        !local.playback.signal.aborted &&
                        localConfirmedBinding.current === local.playback &&
                        currentLocalScope.current === localScope
                      )
                        pauseSession();
                    }
                    return;
                  }
                  if (mediaSession && !torrentSwitchRef.current) pauseSession(mediaSession);
                }}
                onProgress={(position, duration, reason) => {
                  if (localSelected) {
                    const binding = local.playback;
                    if (
                      !binding ||
                      binding.signal.aborted ||
                      local.pending ||
                      localBinding.current !== binding ||
                      currentLocalScope.current !== localScope
                    )
                      return;
                    if (localConfirmedBinding.current !== binding) {
                      localConfirmedBinding.current = binding;
                      const row = localFiles.find((row) => row.file.ref === binding.fileRef);
                      startSession({
                        mediaRef: media.mediaRef,
                        mediaSnapshot: {
                          title: media.title,
                          slug: media.slug,
                          artwork: media.poster,
                        },
                        sourceRef: LOCAL_PLAYBACK_SOURCE_REF,
                        episode: row?.episode ?? null,
                        positionSeconds: position,
                        durationSeconds: duration,
                      });
                      if (localPaused) pauseSession();
                    }
                    updateProgress(position, duration, reason);
                    return;
                  }
                  if (mediaSession && !torrentSwitchRef.current)
                    updateProgress(position, duration, reason, mediaSession);
                }}
                onRetry={
                  localSelected
                    ? () => {
                        if (local.snapshot?.selectedFileRef)
                          void selectLocalFile(local.snapshot.selectedFileRef);
                        else setTorrentOpen(true);
                      }
                    : torrentSelected || activeTorrentId
                      ? requestTorrentPlayback
                      : directSourceUnconfirmed
                        ? () => void retryEpisodeAvailability()
                        : loadPlayer
                }
                errorDescription={
                  (localSelected ? local.error : null) ??
                  torrentLaunchError ??
                  (activeTorrentId
                    ? torrentErrorDescription
                    : directSourceUnconfirmed
                      ? 'Не удалось подготовить выбранный источник. Повторите поиск или выберите другой.'
                      : undefined)
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
                        audioTracks: torrentPlayback.audioTracks,
                        selectedAudioTrackRef: torrentPlayback.selectedAudioTrackRef,
                        generation: torrentPlayback.generation,
                        subtitleTracks: torrentPlayback.subtitleTracks,
                        output: torrentPlayback.output,
                        onReplace: replaceTorrent,
                      }
                    : undefined
                }
                directControls={
                  !localSelected && !activeTorrentId && selectedDirectSource
                    ? {
                        tracks: directTracks.map((track) => ({
                          value: track.key,
                          label: track.label,
                          language: track.sources[0]?.translation?.language,
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
                      }
                    : undefined
                }
              />
            </div>
          </div>
        </div>

        {media.description && (
          <section className="media-view-details min-w-0">
            <MediaDescriptionPanel compact>
              <p
                className={[
                  'mt-2 text-body text-text-secondary',
                  isDescriptionExpanded ? '' : 'line-clamp-4 sm:line-clamp-none',
                ].join(' ')}
              >
                {media.description}
              </p>
              <button
                type="button"
                className="mt-2 text-sm font-semibold text-text-primary transition-colors hover:text-watermark sm:hidden"
                onClick={() => setIsDescriptionExpanded((current) => !current)}
                aria-expanded={isDescriptionExpanded}
              >
                {isDescriptionExpanded ? 'Свернуть' : 'Подробнее'}
              </button>
            </MediaDescriptionPanel>
          </section>
        )}

        <MediaCommunity media={media} />
      </div>
    </div>
  );
}
