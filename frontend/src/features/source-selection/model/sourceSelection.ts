import type {
  MediaAvailability,
  MediaAvailabilityEpisode,
  MediaSourceEpisodeRef,
  MediaSourceOption,
} from '@/entities/media-source';

export type PlaybackMode = 'embed' | 'direct';
export type PlaybackSourcePanel = 'players' | 'direct';

export type DirectEpisodeOption = {
  key: string;
  title?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  absoluteEpisodeNumber?: number;
  releaseEpisodeNumber?: number;
  sources: readonly MediaSourceOption[];
};

export type DirectTrackOption = {
  key: string;
  label: string;
  sources: readonly MediaSourceOption[];
};

export type DirectQualityOption = {
  key: string;
  label: string;
  source: MediaSourceOption;
};

export type PlaybackSourceCatalog = {
  embedSources: readonly MediaSourceOption[];
  directSources: readonly MediaSourceOption[];
  directEpisodes: readonly DirectEpisodeOption[];
};

function getDirectEpisodeKey(episode: MediaSourceEpisodeRef) {
  if (episode.seasonNumber !== undefined && episode.episodeNumber !== undefined) {
    return `season:${episode.seasonNumber}:episode:${episode.episodeNumber}`;
  }

  if (episode.absoluteEpisodeNumber !== undefined) {
    return `absolute:${episode.absoluteEpisodeNumber}`;
  }

  if (episode.episodeNumber !== undefined) {
    return `episode:${episode.episodeNumber}`;
  }

  return null;
}

export function isDirectMediaSource(source: MediaSourceOption) {
  return source.kind === 'hls' || source.kind === 'mp4';
}

export function getPlaybackSourcePanel(source: MediaSourceOption | undefined): PlaybackSourcePanel {
  return source?.kind === 'embed' ? 'players' : 'direct';
}

function toDirectEpisodeOption(episode: MediaAvailabilityEpisode): DirectEpisodeOption | null {
  const key = getDirectEpisodeKey(episode);
  const sources = episode.sources.filter(isDirectMediaSource);

  if (!key) {
    return null;
  }

  return {
    key,
    title: episode.title,
    seasonNumber: episode.seasonNumber,
    episodeNumber: episode.episodeNumber,
    absoluteEpisodeNumber: episode.absoluteEpisodeNumber,
    sources,
  };
}

export function createPlaybackSourceCatalog(
  availability: MediaAvailability,
  flattenEpisodeSources = false,
): PlaybackSourceCatalog {
  const sources = flattenEpisodeSources
    ? [
        ...new Map(
          [
            ...availability.sources,
            ...availability.episodes.flatMap((episode) => episode.sources),
          ].map((source) => [source.sourceRef, source]),
        ).values(),
      ]
    : availability.sources;

  return {
    embedSources: sources.filter((source) => source.kind === 'embed'),
    directSources: sources.filter(isDirectMediaSource),
    directEpisodes: flattenEpisodeSources
      ? []
      : availability.episodes
          .map(toDirectEpisodeOption)
          .filter((episode): episode is DirectEpisodeOption => episode !== null),
  };
}

export function mergeEpisodeEmbedSources(
  baseSources: readonly MediaSourceOption[],
  availability: MediaAvailability | null,
  episodeRef: MediaSourceEpisodeRef | null,
): readonly MediaSourceOption[] {
  if (!availability || !episodeRef) return baseSources;

  const episodeSources = availability.episodes
    .filter((episode) => {
      const matchesSeasonEpisode =
        episodeRef.episodeNumber !== undefined &&
        episode.episodeNumber === episodeRef.episodeNumber &&
        (episodeRef.seasonNumber === undefined || episode.seasonNumber === episodeRef.seasonNumber);
      const matchesAbsoluteEpisode =
        episodeRef.absoluteEpisodeNumber !== undefined &&
        episode.absoluteEpisodeNumber === episodeRef.absoluteEpisodeNumber;

      return matchesSeasonEpisode || matchesAbsoluteEpisode;
    })
    .flatMap((episode) => episode.sources)
    .filter((source) => source.kind === 'embed');

  return [
    ...new Map(
      [...baseSources, ...episodeSources].map((source) => [source.sourceRef, source]),
    ).values(),
  ];
}

export function getPreferredSource(sources: readonly MediaSourceOption[]) {
  return (
    sources.find((source) => source.availability === 'available' && source.browserSupported) ??
    sources[0]
  );
}

export function getAvailableDirectSourceForTrack(
  sources: readonly MediaSourceOption[],
  trackKey: string | null,
) {
  if (!trackKey) return undefined;

  return sources.find(
    (source) =>
      getDirectTrackKey(source) === trackKey &&
      source.availability === 'available' &&
      source.browserSupported,
  );
}

export function getDirectSourceForTrackPreference(
  sources: readonly MediaSourceOption[],
  preferredTrackKey: string | null,
) {
  return (
    getAvailableDirectSourceForTrack(sources, preferredTrackKey) ?? getPreferredSource(sources)
  );
}

export function findDirectEpisodeBySourceRef(
  episodes: readonly DirectEpisodeOption[],
  sourceRef: string | undefined,
) {
  if (!sourceRef) return undefined;

  return episodes.find((episode) =>
    episode.sources.some((source) => source.sourceRef === sourceRef),
  );
}

export function findDirectEpisodeByRef(
  episodes: readonly DirectEpisodeOption[],
  episodeRef: MediaSourceEpisodeRef | null | undefined,
) {
  if (!episodeRef) return undefined;

  return episodes.find((episode) => {
    if (
      episodeRef.seasonNumber !== undefined &&
      episodeRef.episodeNumber !== undefined &&
      episode.seasonNumber === episodeRef.seasonNumber &&
      episode.episodeNumber === episodeRef.episodeNumber
    ) {
      return true;
    }

    return (
      episodeRef.absoluteEpisodeNumber !== undefined &&
      episode.absoluteEpisodeNumber === episodeRef.absoluteEpisodeNumber
    );
  });
}

export function getDirectTrackKey(source: MediaSourceOption) {
  const translation = source.translation;

  return [
    source.provider,
    translation?.title ?? source.label,
    translation?.type ?? 'unknown',
    translation?.language ?? '',
    translation?.team ?? '',
  ].join('\u001f');
}

function getDirectTrackLabel(source: MediaSourceOption) {
  return source.translation?.title ?? source.label;
}

export function getDirectTrackOptions(
  sources: readonly MediaSourceOption[],
): readonly DirectTrackOption[] {
  const groups = new Map<string, MediaSourceOption[]>();

  for (const source of sources) {
    const key = getDirectTrackKey(source);
    const group = groups.get(key);

    if (group) {
      group.push(source);
    } else {
      groups.set(key, [source]);
    }
  }

  return Array.from(groups, ([key, groupSources]) => ({
    key,
    label: getDirectTrackLabel(groupSources[0]),
    sources: groupSources,
  }));
}

export function getDirectQualityKey(source: MediaSourceOption) {
  return `${source.quality?.height ?? 'auto'}\u001f${source.quality?.label ?? 'Авто'}`;
}

export function getDirectQualityOptions(
  sources: readonly MediaSourceOption[],
): readonly DirectQualityOption[] {
  const qualities = new Map<string, DirectQualityOption>();

  for (const source of sources) {
    const key = getDirectQualityKey(source);

    if (!qualities.has(key)) {
      qualities.set(key, {
        key,
        label: source.quality?.label ?? 'Авто',
        source,
      });
    }
  }

  return Array.from(qualities.values()).sort((first, second) => {
    const firstHeight = first.source.quality?.height ?? -1;
    const secondHeight = second.source.quality?.height ?? -1;

    return secondHeight - firstHeight;
  });
}

export function getDirectEpisodeDisplayNumber(episode: DirectEpisodeOption) {
  return episode.episodeNumber ?? episode.absoluteEpisodeNumber;
}

function compareDirectEpisodes(first: DirectEpisodeOption, second: DirectEpisodeOption) {
  if (first.seasonNumber !== undefined && second.seasonNumber !== undefined) {
    const seasonDifference = first.seasonNumber - second.seasonNumber;

    if (seasonDifference !== 0) {
      return seasonDifference;
    }
  }

  return (
    (getDirectEpisodeDisplayNumber(first) ?? Number.MAX_SAFE_INTEGER) -
    (getDirectEpisodeDisplayNumber(second) ?? Number.MAX_SAFE_INTEGER)
  );
}

function orderDirectEpisodes(episodes: readonly DirectEpisodeOption[]) {
  return [...episodes].sort(compareDirectEpisodes);
}

export function getNextDirectEpisode(
  episodes: readonly DirectEpisodeOption[],
  currentEpisode: DirectEpisodeOption | undefined,
) {
  if (!currentEpisode) return undefined;

  const orderedEpisodes = orderDirectEpisodes(episodes);
  const currentIndex = orderedEpisodes.findIndex((episode) => episode.key === currentEpisode.key);

  return currentIndex < 0 ? undefined : orderedEpisodes[currentIndex + 1];
}

export function getAdjacentDirectEpisodes(
  episodes: readonly DirectEpisodeOption[],
  currentEpisode: DirectEpisodeOption | undefined,
) {
  if (!currentEpisode) return [];

  const orderedEpisodes = orderDirectEpisodes(episodes);
  const currentIndex = orderedEpisodes.findIndex((episode) => episode.key === currentEpisode.key);

  if (currentIndex < 0) return [];

  return [
    orderedEpisodes[currentIndex + 1],
    orderedEpisodes[currentIndex - 1],
    orderedEpisodes[currentIndex + 2],
  ].filter((episode): episode is DirectEpisodeOption => episode !== undefined);
}
