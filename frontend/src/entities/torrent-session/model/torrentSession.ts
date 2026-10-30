import type { TorrentOutput } from './torrentOutput';

export type TorrentSessionState =
  | 'created'
  | 'fetching_metadata'
  | 'awaiting_file'
  | 'probing'
  | 'awaiting_playback'
  | 'preparing'
  | 'ready'
  | 'failed';

export type TorrentFailureCode =
  | 'TORRENT_INVALID_INPUT'
  | 'TORRENT_METADATA_TIMEOUT'
  | 'TORRENT_NO_VIDEO_FILES'
  | 'TORRENT_SIZE_LIMIT_EXCEEDED'
  | 'TORRENT_UNAVAILABLE'
  | 'TORRENT_PROBE_TIMEOUT'
  | 'TORRENT_UNSUPPORTED_MEDIA'
  | 'TORRENT_TRANSCODE_FAILED'
  | 'TORRENT_PLAYBACK_TIMEOUT'
  | 'TORRENT_CAPACITY_EXCEEDED'
  | 'TORRENT_UPSTREAM_UNAVAILABLE'
  | 'TORRENT_RESOURCE_LIMIT';

export type TorrentFile = {
  ref: string;
  name: string;
  sizeBytes: number;
};

export type TorrentAudioTrack = {
  ref: string;
  label: string;
  language: string | null;
  channels: number | null;
  isDefault: boolean;
};

export type TorrentSubtitleTrack = {
  ref: string;
  label: string;
  language: string | null;
  format: 'vtt' | 'ass' | 'pgs' | 'vobsub';
  isDefault: boolean;
  isForced: boolean;
  isSdh: boolean;
  available: boolean;
  unavailableReason: string | null;
  url: string;
  fonts: { ref: string; url: string }[];
};

export type TorrentSession = {
  id: string;
  mediaRef: string | null;
  state: TorrentSessionState;
  version: number;
  createdAt: string;
  expiresAt: string;
  idleExpiresAt: string;
  progress: {
    basisPoints: number | null;
    speedBytesPerSecond: number;
    peers: number;
    downloadedBytes: number;
  };
  files: TorrentFile[];
  selectedFileRef: string | null;
  audioTracks: TorrentAudioTrack[];
  playback: {
    hlsUrl: string;
    generation: number;
    startPositionSeconds: number;
    timeline: {
      continuous?: boolean;
      absoluteAnchorSeconds: number;
      mediaAnchorSeconds: number;
      windowEndSeconds: number;
    };
    playbackRates: number[];
    durationSeconds: number | null;
    selectedAudioTrackRef: string;
    audioTracks: TorrentAudioTrack[];
    subtitleTracks?: TorrentSubtitleTrack[];
    output?: TorrentOutput;
  } | null;
  failure: {
    code: TorrentFailureCode;
    retryable: boolean;
    retryAction: 'create_session' | 'start_playback' | null;
  } | null;
};

export function torrentPlaybackSourceRef(sessionId: string): string {
  return `torrent:${sessionId}`;
}

export function isTorrentPlaybackSourceRef(sourceRef: string): boolean {
  return sourceRef.startsWith('torrent:torrent_session_');
}
