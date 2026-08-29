import type {
  MediaAvailability,
  MediaAvailabilityEpisode,
  MediaSourceEpisodeRef,
  MediaSourceOption,
} from '../model/mediaSource';
import type {
  MediaAvailabilityDto,
  MediaAvailabilityEpisodeDto,
  MediaSourceEpisodeRefDto,
  MediaSourceOptionDto,
} from './mediaAvailabilityDto';

function mapMediaSourceEpisodeRef(dto: MediaSourceEpisodeRefDto): MediaSourceEpisodeRef {
  return {
    seasonNumber: dto.seasonNumber,
    episodeNumber: dto.episodeNumber,
    absoluteEpisodeNumber: dto.absoluteEpisodeNumber,
  };
}

function mapMediaSourceOption(dto: MediaSourceOptionDto): MediaSourceOption {
  return {
    sourceRef: dto.sourceRef,
    provider: dto.provider,
    kind: dto.kind,
    label: dto.label,
    translation: dto.translation
      ? {
          title: dto.translation.title,
          type: dto.translation.type,
          language: dto.translation.language,
          team: dto.translation.team,
        }
      : undefined,
    quality: dto.quality
      ? {
          label: dto.quality.label,
          height: dto.quality.height,
        }
      : undefined,
    episode: dto.episode ? mapMediaSourceEpisodeRef(dto.episode) : undefined,
    url: dto.url,
    availability: dto.availability,
    browserSupported: dto.browserSupported,
    expiresAt: dto.expiresAt,
  };
}

function mapMediaAvailabilityEpisode(dto: MediaAvailabilityEpisodeDto): MediaAvailabilityEpisode {
  return {
    ...mapMediaSourceEpisodeRef(dto),
    title: dto.title,
    sources: dto.sources.map(mapMediaSourceOption),
  };
}

export function mapMediaAvailability(dto: MediaAvailabilityDto): MediaAvailability {
  return {
    sources: dto.sources.map(mapMediaSourceOption),
    episodes: dto.episodes.map(mapMediaAvailabilityEpisode),
    checkedAt: dto.checkedAt,
    degraded: dto.degraded,
    hasExpiredSources: dto.hasExpiredSources,
  };
}
