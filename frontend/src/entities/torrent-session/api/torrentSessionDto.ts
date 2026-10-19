import type { TorrentFailureCode, TorrentSessionState } from '../model/torrentSession';

export type TorrentAudioTrackDto = {
  trackRef: string;
  label: string;
  language: string | null;
  channels: number | null;
  isDefault: boolean;
};

export type TorrentSessionDto = {
  sessionId: string;
  mediaRef: string | null;
  state: TorrentSessionState;
  version: number;
  createdAt: string;
  expiresAt: string;
  idleExpiresAt: string;
  status: {
    progressBasisPoints: number | null;
    downloadSpeedBytesPerSecond: number;
    peers: number;
    downloadedBytes: number;
  };
  files: { fileRef: string; displayName: string; sizeBytes: number; mediaKind: 'video' }[];
  selectedFileRef: string | null;
  audioTracks: TorrentAudioTrackDto[];
  playback: {
    source: { type: 'hls'; url: string };
    generation: number;
    startPositionSeconds: number;
    durationSeconds: number | null;
    selectedAudioTrackRef: string;
    audioTracks: TorrentAudioTrackDto[];
    supportsSubtitleSelection: false;
  } | null;
  failure: {
    code: TorrentFailureCode;
    retryable: boolean;
    retryAction: 'create_session' | 'start_playback' | null;
  } | null;
};
