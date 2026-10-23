import { randomBytes } from 'node:crypto';

export interface AudioTrack {
  trackRef: string;
  streamIndex: number;
  label: string;
  language: string | null;
  channels: number | null;
  isDefault: boolean;
  copy: boolean;
}

export interface TorrentProbe {
  fileRef: string;
  durationSeconds: number | null;
  videoStreamIndex: number;
  copyVideo: boolean;
  audioTracks: AudioTrack[];
}

type Stream = {
  index?: unknown;
  codec_type?: unknown;
  codec_name?: unknown;
  profile?: unknown;
  level?: unknown;
  width?: unknown;
  height?: unknown;
  pix_fmt?: unknown;
  avg_frame_rate?: unknown;
  bit_rate?: unknown;
  sample_rate?: unknown;
  channels?: unknown;
  tags?: { language?: unknown; title?: unknown };
  disposition?: { default?: unknown };
};

export class UnsupportedTorrentMedia extends Error {}

const bitrate = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

export function parseTorrentProbe(fileRef: string, raw: unknown): TorrentProbe {
  if (!raw || typeof raw !== 'object') throw new UnsupportedTorrentMedia();
  const data = raw as { streams?: unknown; format?: { duration?: unknown } };
  if (!Array.isArray(data.streams) || data.streams.length > 64) throw new UnsupportedTorrentMedia();
  const streams = data.streams as Stream[];
  const video = streams.find((stream) => stream.codec_type === 'video');
  if (!video || !Number.isSafeInteger(video.index) || Number(video.index) < 0)
    throw new UnsupportedTorrentMedia();
  const width = Number(video.width);
  const height = Number(video.height);
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width < 16 ||
    height < 16 ||
    width > 4096 ||
    height > 2160
  )
    throw new UnsupportedTorrentMedia();
  const rate = (typeof video.avg_frame_rate === 'string' ? video.avg_frame_rate : '')
    .split('/')
    .map(Number);
  const fps = rate.length === 2 && rate[1] > 0 ? rate[0] / rate[1] : Infinity;
  const copyVideo =
    video.codec_name === 'h264' &&
    ['Constrained Baseline', 'Baseline', 'Main', 'High'].includes(String(video.profile)) &&
    video.pix_fmt === 'yuv420p' &&
    Number(video.level) <= 41 &&
    width <= 1280 &&
    height <= 720 &&
    fps > 0 &&
    fps <= 60 &&
    bitrate(video.bit_rate) !== null &&
    bitrate(video.bit_rate)! <= 8_000_000;
  const audioTracks = streams
    .filter((stream) => stream.codec_type === 'audio')
    .map((stream) => {
      if (!Number.isSafeInteger(stream.index) || Number(stream.index) < 0)
        throw new UnsupportedTorrentMedia();
      const language =
        typeof stream.tags?.language === 'string' && /^[a-zA-Z]{2,3}$/.test(stream.tags.language)
          ? stream.tags.language.toLowerCase()
          : null;
      const title = typeof stream.tags?.title === 'string' ? stream.tags.title : '';
      const label =
        title
          .replace(/[\p{C}<>]/gu, '')
          .trim()
          .slice(0, 80) || `Audio ${Number(stream.index)}`;
      const channels = Number.isInteger(stream.channels) ? Number(stream.channels) : null;
      return {
        trackRef: `torrent_track_${randomBytes(16).toString('base64url')}`,
        streamIndex: Number(stream.index),
        label,
        language,
        channels,
        isDefault: stream.disposition?.default === 1,
        copy:
          stream.codec_name === 'aac' &&
          stream.profile === 'LC' &&
          channels !== null &&
          channels >= 1 &&
          channels <= 2 &&
          Number(stream.sample_rate) <= 48_000 &&
          bitrate(stream.bit_rate) !== null &&
          bitrate(stream.bit_rate)! <= 320_000,
      };
    });
  if (audioTracks.length === 0 || audioTracks.length > 32) throw new UnsupportedTorrentMedia();
  const duration = Number(data.format?.duration);
  return {
    fileRef,
    durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : null,
    videoStreamIndex: Number(video.index),
    copyVideo,
    audioTracks,
  };
}
