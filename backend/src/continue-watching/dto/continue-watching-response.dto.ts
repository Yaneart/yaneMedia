export class ContinueWatchingEpisodeDto {
  seasonNumber?: number;
  episodeNumber!: number;
  absoluteEpisodeNumber?: number;
}

export class ContinueWatchingEntryDto {
  mediaRef!: string;
  sourceRef!: string;
  episode!: ContinueWatchingEpisodeDto | null;
  positionSeconds!: number;
  durationSeconds!: number | null;
  updatedAt!: string;
}

export class ContinueWatchingResponseDto {
  entries!: ContinueWatchingEntryDto[];
}
