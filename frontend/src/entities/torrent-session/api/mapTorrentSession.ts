import { ApiClientError } from '@/shared/api';
import { API_BASE_URL } from '../../../shared/api/apiConfig';
import { validTorrentOutput } from './validTorrentOutput';
import type { TorrentAudioTrack, TorrentSession } from '../model/torrentSession';
import type {
  TorrentAudioTrackDto,
  TorrentSessionDto,
  TorrentSubtitleTrackDto,
} from './torrentSessionDto';

const states = new Set([
  'created',
  'fetching_metadata',
  'awaiting_file',
  'probing',
  'awaiting_playback',
  'preparing',
  'ready',
  'failed',
]);
const failureCodes = new Set([
  'TORRENT_INVALID_INPUT',
  'TORRENT_METADATA_TIMEOUT',
  'TORRENT_NO_VIDEO_FILES',
  'TORRENT_SIZE_LIMIT_EXCEEDED',
  'TORRENT_UNAVAILABLE',
  'TORRENT_PROBE_TIMEOUT',
  'TORRENT_UNSUPPORTED_MEDIA',
  'TORRENT_TRANSCODE_FAILED',
  'TORRENT_PLAYBACK_TIMEOUT',
  'TORRENT_CAPACITY_EXCEEDED',
  'TORRENT_UPSTREAM_UNAVAILABLE',
  'TORRENT_RESOURCE_LIMIT',
]);

function invalid(): never {
  throw new ApiClientError('Invalid torrent session response', 200, 'INVALID_RESPONSE');
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function count(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function audioTrack(value: unknown): value is TorrentAudioTrackDto {
  return (
    record(value) &&
    typeof value.trackRef === 'string' &&
    value.trackRef.length > 0 &&
    typeof value.label === 'string' &&
    (value.language === null || typeof value.language === 'string') &&
    (value.channels === null || count(value.channels)) &&
    typeof value.isDefault === 'boolean'
  );
}

function mapAudioTrack(dto: TorrentAudioTrackDto): TorrentAudioTrack {
  return {
    ref: dto.trackRef,
    label: dto.label,
    language: dto.language,
    channels: dto.channels,
    isDefault: dto.isDefault,
  };
}

function validMasterUrl(url: unknown, sessionId: string): url is string {
  return url === `/api/v1/torrent-sessions/${encodeURIComponent(sessionId)}/hls/master.m3u8`;
}

function subtitleTrack(
  value: unknown,
  id: string,
  generation: number,
): value is TorrentSubtitleTrackDto {
  if (!record(value)) return false;
  const base = `/api/v1/torrent-sessions/${id}`;
  return (
    typeof value.trackRef === 'string' &&
    /^torrent_subtitle_[A-Za-z0-9_-]{22}$/.test(value.trackRef) &&
    typeof value.label === 'string' &&
    value.label.length <= 80 &&
    (value.language === null || typeof value.language === 'string') &&
    ['vtt', 'ass', 'pgs', 'vobsub'].includes(value.format as string) &&
    [value.isDefault, value.isForced, value.isSdh, value.available].every(
      (item) => typeof item === 'boolean',
    ) &&
    value.available === ['vtt', 'ass'].includes(value.format as string) &&
    (value.unavailableReason === null ||
      (typeof value.unavailableReason === 'string' && value.unavailableReason.length <= 255)) &&
    value.url === `${base}/subtitles/${generation}/${value.trackRef}` &&
    Array.isArray(value.fonts) &&
    value.fonts.length <= 4 &&
    value.fonts.every(
      (font) =>
        record(font) &&
        typeof font.fontRef === 'string' &&
        /^torrent_font_[A-Za-z0-9_-]{22}$/.test(font.fontRef) &&
        font.url === `${base}/subtitle-fonts/${generation}/${font.fontRef}`,
    )
  );
}

export function mapTorrentSession(value: unknown): TorrentSession {
  if (!record(value)) invalid();
  const dto = value as Partial<TorrentSessionDto>;
  const status = dto.status;
  if (
    typeof dto.sessionId !== 'string' ||
    !/^torrent_session_[A-Za-z0-9_-]{22}$/.test(dto.sessionId) ||
    !states.has(dto.state ?? '') ||
    !Number.isSafeInteger(dto.version) ||
    (dto.version ?? 0) < 1 ||
    (dto.mediaRef !== null &&
      (typeof dto.mediaRef !== 'string' || !/^work_[\w-]+$/.test(dto.mediaRef))) ||
    ![dto.createdAt, dto.expiresAt, dto.idleExpiresAt].every(
      (date) => typeof date === 'string' && Number.isFinite(Date.parse(date)),
    ) ||
    !record(status) ||
    (status.progressBasisPoints !== null &&
      (!count(status.progressBasisPoints) || status.progressBasisPoints > 10_000)) ||
    !nonNegative(status.downloadSpeedBytesPerSecond) ||
    !count(status.peers) ||
    !count(status.downloadedBytes) ||
    !Array.isArray(dto.files) ||
    !dto.files.every(
      (file) =>
        record(file) &&
        typeof file.fileRef === 'string' &&
        typeof file.displayName === 'string' &&
        count(file.sizeBytes) &&
        file.mediaKind === 'video',
    ) ||
    (dto.selectedFileRef !== null && typeof dto.selectedFileRef !== 'string') ||
    !Array.isArray(dto.audioTracks) ||
    !dto.audioTracks.every(audioTrack)
  )
    invalid();

  const playback = dto.playback;
  if (
    playback !== null &&
    (!record(playback) ||
      !record(playback.source) ||
      playback.source.type !== 'hls' ||
      !validMasterUrl(playback.source.url, dto.sessionId!) ||
      !count(playback.generation) ||
      !nonNegative(playback.startPositionSeconds) ||
      !record(playback.timeline) ||
      !nonNegative(playback.timeline.absoluteAnchorSeconds) ||
      !nonNegative(playback.timeline.mediaAnchorSeconds) ||
      !nonNegative(playback.timeline.windowEndSeconds) ||
      playback.timeline.windowEndSeconds <= playback.timeline.absoluteAnchorSeconds ||
      !Array.isArray(playback.playbackRates) ||
      !playback.playbackRates.length ||
      !playback.playbackRates.every((rate) =>
        [0.2, 0.5, 0.7, 1, 1.2, 1.5, 1.7, 2].includes(rate),
      ) ||
      (playback.durationSeconds !== null && !nonNegative(playback.durationSeconds)) ||
      typeof playback.selectedAudioTrackRef !== 'string' ||
      !Array.isArray(playback.audioTracks) ||
      !playback.audioTracks.every(audioTrack) ||
      typeof playback.supportsSubtitleSelection !== 'boolean' ||
      (playback.output !== undefined && !validTorrentOutput(playback.output)) ||
      (playback.subtitleTracks !== undefined &&
        (!Array.isArray(playback.subtitleTracks) ||
          playback.subtitleTracks.length > 16 ||
          !playback.subtitleTracks.every((track) =>
            subtitleTrack(track, dto.sessionId!, playback.generation),
          ))) ||
      playback.supportsSubtitleSelection !==
        (playback.subtitleTracks ?? []).some((track) => track.available))
  )
    invalid();

  const failure = dto.failure;
  if (
    failure !== null &&
    (!record(failure) ||
      !failureCodes.has(failure.code as string) ||
      typeof failure.retryable !== 'boolean' ||
      !['create_session', 'start_playback', null].includes(failure.retryAction))
  )
    invalid();

  return {
    id: dto.sessionId!,
    mediaRef: dto.mediaRef!,
    state: dto.state!,
    version: dto.version!,
    createdAt: dto.createdAt!,
    expiresAt: dto.expiresAt!,
    idleExpiresAt: dto.idleExpiresAt!,
    progress: {
      basisPoints: status.progressBasisPoints,
      speedBytesPerSecond: status.downloadSpeedBytesPerSecond,
      peers: status.peers,
      downloadedBytes: status.downloadedBytes,
    },
    files: dto.files!.map((file) => ({
      ref: file.fileRef,
      name: file.displayName,
      sizeBytes: file.sizeBytes,
    })),
    selectedFileRef: dto.selectedFileRef!,
    audioTracks: dto.audioTracks!.map(mapAudioTrack),
    playback: playback
      ? {
          hlsUrl: new URL(playback.source.url, API_BASE_URL).toString(),
          generation: playback.generation,
          startPositionSeconds: playback.startPositionSeconds,
          timeline: playback.timeline,
          playbackRates: playback.playbackRates,
          durationSeconds: playback.durationSeconds,
          selectedAudioTrackRef: playback.selectedAudioTrackRef,
          audioTracks: playback.audioTracks.map(mapAudioTrack),
          output: playback.output,
          subtitleTracks: (playback.subtitleTracks ?? []).map(
            ({ trackRef, url, fonts, ...track }) => ({
              ...track,
              ref: trackRef,
              url: new URL(url, API_BASE_URL).toString(),
              fonts: fonts.map((font) => ({
                ref: font.fontRef,
                url: new URL(font.url, API_BASE_URL).toString(),
              })),
            }),
          ),
        }
      : null,
    failure: failure ?? null,
  };
}
