import type { MediaAvailability, StreamEpisodeRef, StreamOption } from '@media-engine/core';
import type {
  MediaAvailabilityDto,
  MediaAvailabilityEpisodeDto,
  MediaSourceEpisodeRefDto,
  MediaSourceOptionDto,
} from './dto/media-availability.dto';

interface SourceMappingResult {
  source?: MediaSourceOptionDto;
  expired: boolean;
}

interface SourcesMappingResult {
  sources: MediaSourceOptionDto[];
  hasExpiredSources: boolean;
}

export function mapMediaAvailability(
  availability: MediaAvailability,
  now = Date.now(),
): MediaAvailabilityDto {
  const topLevel = mapSourceOptions(
    availability.options.filter((option) => !option.episode),
    now,
  );
  const episodes: MediaAvailabilityEpisodeDto[] = [];
  let hasExpiredSources = topLevel.hasExpiredSources;

  for (const episode of availability.episodes ?? []) {
    const episodeRef = mapEpisodeRef(episode);

    if (!episodeRef) {
      continue;
    }

    const mapped = mapSourceOptions(episode.options, now, episodeRef);
    hasExpiredSources ||= mapped.hasExpiredSources;

    if (mapped.sources.length === 0) {
      continue;
    }

    episodes.push({
      ...episodeRef,
      title: normalizeOptionalString(episode.title),
      sources: mapped.sources,
    });
  }

  return {
    sources: topLevel.sources,
    episodes,
    checkedAt: availability.checkedAt,
    degraded:
      (availability.meta?.providers.failed.length ?? 0) > 0 ||
      (availability.meta?.warnings?.length ?? 0) > 0 ||
      availability.meta?.stale === true,
    hasExpiredSources,
  };
}

function mapSourceOptions(
  options: readonly StreamOption[],
  now: number,
  fallbackEpisode?: MediaSourceEpisodeRefDto,
): SourcesMappingResult {
  const sourcesByKey = new Map<string, MediaSourceOptionDto>();
  let hasExpiredSources = false;

  for (const option of options) {
    const mapped = mapSourceOption(option, now, fallbackEpisode);
    hasExpiredSources ||= mapped.expired;

    if (!mapped.source) {
      continue;
    }

    const key = createSourceKey(mapped.source);
    const existing = sourcesByKey.get(key);

    if (!existing || (!existing.browserSupported && mapped.source.browserSupported)) {
      sourcesByKey.set(key, mapped.source);
    }
  }

  return {
    sources: [...sourcesByKey.values()],
    hasExpiredSources,
  };
}

function mapSourceOption(
  option: StreamOption,
  now: number,
  fallbackEpisode?: MediaSourceEpisodeRefDto,
): SourceMappingResult {
  const optionId = normalizeRequiredString(option.id);
  const provider = normalizeRequiredString(option.provider);
  const label = normalizeRequiredString(option.player.label);
  const url = normalizeHttpUrl(option.access.url);

  if (!optionId || !provider || !label || !url) {
    return { expired: false };
  }

  let expiresAt: string | undefined;

  if (option.expiresAt !== undefined) {
    const expirationTime = Date.parse(option.expiresAt);

    if (!Number.isFinite(expirationTime)) {
      return { expired: false };
    }

    if (expirationTime <= now) {
      return { expired: true };
    }

    expiresAt = new Date(expirationTime).toISOString();
  }

  const episode = mapEpisodeRef({
    seasonNumber: option.episode?.seasonNumber ?? fallbackEpisode?.seasonNumber,
    episodeNumber: option.episode?.episodeNumber ?? fallbackEpisode?.episodeNumber,
    absoluteEpisodeNumber:
      option.episode?.absoluteEpisodeNumber ?? fallbackEpisode?.absoluteEpisodeNumber,
  });
  const translationTitle = normalizeOptionalString(option.translation?.title);
  const qualityLabel = normalizeOptionalString(option.quality?.label);

  return {
    expired: false,
    source: {
      sourceRef: `stream:${provider}:${optionId}`,
      provider,
      kind: option.player.kind,
      label,
      translation: translationTitle
        ? {
            title: translationTitle,
            type: option.translation?.type ?? 'unknown',
            language: normalizeOptionalString(option.translation?.language),
            team: normalizeOptionalString(option.translation?.team),
          }
        : undefined,
      quality: qualityLabel
        ? {
            label: qualityLabel,
            height: option.quality?.height,
          }
        : undefined,
      episode,
      url: url.href,
      availability: option.availability,
      browserSupported: isBrowserSupported(option, url),
      expiresAt,
    },
  };
}

function mapEpisodeRef(
  episode: StreamEpisodeRef | undefined,
): MediaSourceEpisodeRefDto | undefined {
  if (!episode) {
    return undefined;
  }

  const mapped = {
    seasonNumber: normalizeNonNegativeInteger(episode.seasonNumber),
    episodeNumber: normalizeNonNegativeInteger(episode.episodeNumber),
    absoluteEpisodeNumber: normalizeNonNegativeInteger(episode.absoluteEpisodeNumber),
  };

  return Object.values(mapped).some((value) => value !== undefined) ? mapped : undefined;
}

function createSourceKey(source: MediaSourceOptionDto): string {
  return [
    source.url,
    source.episode?.seasonNumber ?? '',
    source.episode?.episodeNumber ?? '',
    source.episode?.absoluteEpisodeNumber ?? '',
  ].join(':');
}

function isBrowserSupported(option: StreamOption, url: URL): boolean {
  const headerNames = Object.keys(option.access.headers ?? {}).map((name) => name.toLowerCase());

  return (
    url.protocol === 'https:' &&
    (option.access.method ?? 'GET') === 'GET' &&
    !option.access.referer &&
    option.player.kind !== 'external' &&
    headerNames.every((name) => name === 'user-agent')
  );
}

function normalizeHttpUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);

    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
      return undefined;
    }

    return url;
  } catch {
    return undefined;
  }
}

function normalizeRequiredString(value: string): string | undefined {
  return normalizeOptionalString(value);
}

function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim();

  return normalized || undefined;
}

function normalizeNonNegativeInteger(value: number | undefined): number | undefined {
  return Number.isInteger(value) && value !== undefined && value >= 0 ? value : undefined;
}

export function selectMediaAvailabilityEpisode(
  availability: MediaAvailabilityDto,
  selection: MediaSourceEpisodeRefDto,
): MediaAvailabilityDto {
  const hasAbsoluteEpisode = selection.absoluteEpisodeNumber !== undefined;
  const hasSeasonEpisode = selection.episodeNumber !== undefined;

  if (!hasAbsoluteEpisode && !hasSeasonEpisode) {
    return availability;
  }

  return {
    ...availability,
    episodes: availability.episodes.filter((episode) => {
      const matchesAbsoluteEpisode =
        hasAbsoluteEpisode && episode.absoluteEpisodeNumber === selection.absoluteEpisodeNumber;

      const matchesSeasonEpisode =
        hasSeasonEpisode &&
        episode.episodeNumber === selection.episodeNumber &&
        (selection.seasonNumber === undefined || episode.seasonNumber === selection.seasonNumber);

      return matchesAbsoluteEpisode || matchesSeasonEpisode;
    }),
  };
}
