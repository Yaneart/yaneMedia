import type { AudioTrack, TorrentProbe } from './torrent-media-policy';

export const TORRENT_OUTPUT_PROFILES = {
  'h264-720p': { width: 1280, height: 720, level: 41, bitrate: '3000k', peak: '3300k' },
  'h264-1080p': { width: 1920, height: 1080, level: 41, bitrate: '5000k', peak: '5500k' },
} as const;
export type TorrentOutputProfile = keyof typeof TORRENT_OUTPUT_PROFILES;
export type TorrentVideoProbe = {
  codec: string;
  profile: string;
  pixelFormat: string;
  bitDepth: number;
  width: number;
  height: number;
  fps: number;
  level: number | null;
  bitrate: number | null;
};

export function isTorrentOutputProfile(value: unknown): value is TorrentOutputProfile {
  return value === 'h264-720p' || value === 'h264-1080p';
}

function videoReason(video: TorrentVideoProbe, profile: TorrentOutputProfile) {
  const limit = TORRENT_OUTPUT_PROFILES[profile];
  if (video.codec !== 'h264') return 'codec';
  if (video.pixelFormat !== 'yuv420p' || video.bitDepth !== 8) return 'pixel_format';
  if (!['Constrained Baseline', 'Baseline', 'Main', 'High'].includes(video.profile))
    return 'profile';
  if (video.width > limit.width || video.height > limit.height) return 'resolution';
  if (video.fps > 30) return 'frame_rate';
  if (video.level === null || video.level > limit.level) return 'level';
  return 'compatible';
}

export function selectTorrentOutput(probe: TorrentProbe, outputProfile: TorrentOutputProfile) {
  return {
    ...probe,
    outputProfile,
    copyVideo: probe.video
      ? videoReason(probe.video, outputProfile) === 'compatible'
      : probe.copyVideo,
  };
}

export function torrentOutputInfo(probe: TorrentProbe, audio: AudioTrack | undefined) {
  const source = probe.video;
  if (!source || !audio) return undefined;
  const profile = probe.outputProfile ?? 'h264-720p';
  const limit = TORRENT_OUTPUT_PROFILES[profile];
  const scale = Math.min(1, limit.width / source.width, limit.height / source.height);
  return {
    profile,
    source: {
      codec: source.codec,
      width: source.width,
      height: source.height,
      bitDepth: source.bitDepth,
      fps: source.fps,
      dynamicRange: 'sdr' as const,
    },
    video: {
      codec: 'h264' as const,
      bitDepth: 8 as const,
      dynamicRange: 'sdr' as const,
      width: probe.copyVideo ? source.width : Math.floor((source.width * scale) / 2) * 2,
      height: probe.copyVideo ? source.height : Math.floor((source.height * scale) / 2) * 2,
      fps: probe.copyVideo ? source.fps : Math.min(30, source.fps),
      mode: probe.copyVideo ? ('copy' as const) : ('transcode' as const),
      reason: videoReason(source, profile),
    },
    audio: {
      codec: 'aac' as const,
      sourceCodec: audio.codec ?? 'unknown',
      sourceChannels: audio.channels,
      channels:
        audio.copy && audio.channels !== null ? audio.channels : Math.min(2, audio.channels ?? 2),
      mode: audio.copy ? ('copy' as const) : ('transcode' as const),
      reason: audio.copy
        ? 'compatible'
        : audio.channels !== null && audio.channels > 2
          ? 'surround'
          : 'compatibility',
    },
  };
}
