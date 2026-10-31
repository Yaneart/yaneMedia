import type { AudioTrack, TorrentProbe } from './torrent-media-policy';
import { originalAudioType, type TorrentClientCapabilities } from './torrent-client-capabilities';

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
  contentType?: string;
  dynamicRange?: 'sdr' | 'hdr';
};

export function isTorrentOutputProfile(value: unknown): value is TorrentOutputProfile {
  return value === 'h264-720p' || value === 'h264-1080p';
}

function videoReason(video: TorrentVideoProbe, profile: TorrentOutputProfile) {
  const limit = TORRENT_OUTPUT_PROFILES[profile];
  if (video.dynamicRange === 'hdr') return 'dynamic_range';
  if (video.codec !== 'h264') return 'codec';
  if (video.pixelFormat !== 'yuv420p' || video.bitDepth !== 8) return 'pixel_format';
  if (!['Constrained Baseline', 'Baseline', 'Main', 'High'].includes(video.profile))
    return 'profile';
  if (video.width > limit.width || video.height > limit.height) return 'resolution';
  if (video.fps > 30) return 'frame_rate';
  if (video.level === null || video.level > limit.level) return 'level';
  return 'compatible';
}

function originalVideoAllowed(video: TorrentVideoProbe) {
  if (!video.contentType || video.fps > 60 || video.level === null) return false;
  if (video.codec === 'h264')
    return (
      video.bitDepth === 8 &&
      video.pixelFormat === 'yuv420p' &&
      ['Constrained Baseline', 'Baseline', 'Main', 'High'].includes(video.profile) &&
      video.level <= 52
    );
  return (
    video.codec === 'hevc' &&
    video.level <= 153 &&
    ((video.profile === 'Main' && video.bitDepth === 8 && video.pixelFormat === 'yuv420p') ||
      (video.profile === 'Main 10' && video.bitDepth === 10 && video.pixelFormat === 'yuv420p10le'))
  );
}

export function selectTorrentOutput(
  probe: TorrentProbe,
  outputProfile: TorrentOutputProfile,
  capabilities?: TorrentClientCapabilities,
) {
  return {
    ...probe,
    outputProfile,
    capabilities,
    copyVideo: probe.video
      ? (capabilities?.originalVideo && originalVideoAllowed(probe.video)) ||
        videoReason(probe.video, outputProfile) === 'compatible'
      : probe.copyVideo,
    audioTracks: probe.audioTracks.map((audio) => ({
      ...audio,
      // Retain the conservative pre-negotiation AAC stereo path for old clients.
      copy: capabilities
        ? capabilities.audio === 'original' && Boolean(originalAudioType(audio))
        : audio.profile === undefined
          ? audio.copy && (!audio.codec || audio.codec === 'aac') && (audio.channels ?? 2) <= 2
          : audio.codec === 'aac' &&
            audio.profile === 'LC' &&
            audio.channels !== null &&
            audio.channels <= 2 &&
            Boolean(originalAudioType(audio)) &&
            audio.bitrate !== undefined &&
            audio.bitrate !== null &&
            audio.bitrate <= 320_000,
    })),
  };
}

export function torrentNeedsUnsupportedTranscode(probe: TorrentProbe) {
  return (
    !probe.copyVideo &&
    !!probe.video &&
    (probe.video.dynamicRange === 'hdr' || probe.video.width > 1920 || probe.video.height > 1080)
  );
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
      dynamicRange: source.dynamicRange ?? 'sdr',
    },
    video: {
      codec: probe.copyVideo ? source.codec : 'h264',
      bitDepth: probe.copyVideo ? source.bitDepth : 8,
      dynamicRange: probe.copyVideo ? (source.dynamicRange ?? 'sdr') : 'sdr',
      width: probe.copyVideo ? source.width : Math.floor((source.width * scale) / 2) * 2,
      height: probe.copyVideo ? source.height : Math.floor((source.height * scale) / 2) * 2,
      fps: probe.copyVideo ? source.fps : Math.min(30, source.fps),
      mode: probe.copyVideo ? ('copy' as const) : ('transcode' as const),
      reason: probe.copyVideo ? 'compatible' : videoReason(source, profile),
    },
    audio: {
      codec: audio.copy ? (audio.codec ?? 'aac') : 'aac',
      sourceCodec: audio.codec ?? 'unknown',
      sourceChannels: audio.channels,
      channels:
        audio.copy && audio.channels !== null
          ? audio.channels
          : Math.min(
              Number(probe.capabilities?.audio.split('-')[1]) || 2,
              (audio.channels ?? 2) >= 8
                ? 8
                : (audio.channels ?? 2) >= 6
                  ? 6
                  : Math.min(2, audio.channels ?? 2),
            ),
      mode: audio.copy ? ('copy' as const) : ('transcode' as const),
      reason: audio.copy
        ? 'compatible'
        : audio.channels !== null && audio.channels > 2
          ? 'surround'
          : 'compatibility',
    },
  };
}
