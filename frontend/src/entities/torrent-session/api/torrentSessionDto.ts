import type { TorrentFailureCode, TorrentSessionState } from '../model/torrentSession';
import type { TorrentOutput } from '../model/torrentOutput';
import type { TorrentClientMedia } from '../model/torrentClientCapabilities';

export type TorrentAudioTrackDto = {
  trackRef: string;
  label: string;
  language: string | null;
  channels: number | null;
  isDefault: boolean;
};

export type TorrentSubtitleTrackDto = {
  trackRef: string;
  label: string;
  language: string | null;
  format: 'vtt' | 'ass' | 'pgs' | 'vobsub';
  isDefault: boolean;
  isForced: boolean;
  isSdh: boolean;
  available: boolean;
  unavailableReason: string | null;
  url: string;
  fonts: { fontRef: string; url: string }[];
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
  media?: TorrentClientMedia;
  playback: {
    source: { type: 'hls'; url: string };
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
    audioTracks: TorrentAudioTrackDto[];
    subtitleTracks?: TorrentSubtitleTrackDto[];
    output?: TorrentOutput;
    supportsSubtitleSelection: boolean;
  } | null;
  failure: {
    code: TorrentFailureCode;
    retryable: boolean;
    retryAction: 'create_session' | 'start_playback' | null;
  } | null;
};
