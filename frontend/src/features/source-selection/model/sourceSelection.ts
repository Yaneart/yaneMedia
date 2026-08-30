import type {
  MediaAvailability,
  MediaAvailabilityEpisode,
  MediaSourceEpisodeRef,
  MediaSourceOption,
} from '@/entities/media-source';

export type PlaybackMode = 'embed' | 'direct';

export type DirectEpisodeOption = {
  key: string;
  title?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  absoluteEpisodeNumber?: number;
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

const providerLabels: Readonly<Record<string, string>> = {
  'kinobd-streaming': 'KinoBD',
  'ddbb-streaming': 'DDBB',
  'veoveo-streaming': 'VeoVeo',
  'videohub-streaming': 'VideoHUB',
  'aniliberty-streaming': 'AniLiberty',
};

export function getProviderLabel(provider: string) {
  return providerLabels[provider] ?? provider;
}

function isSameLabel(first: string, second: string) {
  return (
    first.localeCompare(second, undefined, {
      sensitivity: 'base',
    }) === 0
  );
}

export function getSourceLabel(source: MediaSourceOption, includeDetails = true) {
  const providerLabel = getProviderLabel(source.provider);
  const hasDistinctProviderLabel = !isSameLabel(providerLabel, source.label);

  return [
    source.label,
    hasDistinctProviderLabel ? providerLabel : undefined,
    includeDetails ? source.translation?.title : undefined,
    includeDetails ? source.quality?.label : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

export function getDirectEpisodeKey(episode: MediaSourceEpisodeRef) {
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

function toDirectEpisodeOption(episode: MediaAvailabilityEpisode): DirectEpisodeOption | null {
  const key = getDirectEpisodeKey(episode);
  const sources = episode.sources.filter((source) => source.kind !== 'embed');

  if (!key || sources.length === 0) {
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
): PlaybackSourceCatalog {
  return {
    embedSources: availability.sources.filter((source) => source.kind === 'embed'),
    directSources: availability.sources.filter((source) => source.kind !== 'embed'),
    directEpisodes: availability.episodes
      .map(toDirectEpisodeOption)
      .filter((episode): episode is DirectEpisodeOption => episode !== null),
  };
}

export function getPreferredSource(sources: readonly MediaSourceOption[]) {
  return (
    sources.find((source) => source.availability === 'available' && source.browserSupported) ??
    sources[0]
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
  const title = source.translation?.title ?? source.label;
  const providerLabel = getProviderLabel(source.provider);
  const sourceIdentifiesProvider = isSameLabel(title, providerLabel);

  return [title, sourceIdentifiesProvider ? undefined : providerLabel].filter(Boolean).join(' · ');
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
