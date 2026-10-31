import { randomBytes } from 'node:crypto';
import { probeSubtitles, type TorrentFont, type TorrentSubtitle } from './torrent-subtitle-policy';
import {
  selectTorrentOutput,
  type TorrentOutputProfile,
  type TorrentVideoProbe,
} from './torrent-output-policy';
import type { TorrentClientCapabilities } from './torrent-client-capabilities';

export interface AudioTrack {
  trackRef: string;
  streamIndex: number;
  label: string;
  language: string | null;
  channels: number | null;
  isDefault: boolean;
  copy: boolean;
  codec?: string;
  profile?: string;
  sampleRate?: number;
  bitrate?: number | null;
}

export interface TorrentProbe {
  fileRef: string;
  durationSeconds: number | null;
  sourceStartSeconds?: number;
  videoStreamIndex: number;
  copyVideo: boolean;
  video?: TorrentVideoProbe;
  outputProfile?: TorrentOutputProfile;
  capabilities?: TorrentClientCapabilities;
  audioTracks: AudioTrack[];
  subtitleTracks?: TorrentSubtitle[];
  subtitleFonts?: TorrentFont[];
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
  r_frame_rate?: unknown;
  bit_rate?: unknown;
  bits_per_raw_sample?: unknown;
  color_transfer?: unknown;
  color_primaries?: unknown;
  color_space?: unknown;
  side_data_list?: Array<{ side_data_type?: unknown }>;
  duration?: unknown;
  sample_rate?: unknown;
  channels?: unknown;
  tags?: { language?: unknown; title?: unknown };
  disposition?: { default?: unknown };
};

export class UnsupportedTorrentMedia extends Error {
  constructor(
    readonly code:
      'TORRENT_UNSUPPORTED_MEDIA' | 'TORRENT_HDR_UNSUPPORTED' = 'TORRENT_UNSUPPORTED_MEDIA',
  ) {
    super(code);
  }
}

const bitrate = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
};

export function parseTorrentProbe(fileRef: string, raw: unknown): TorrentProbe {
  if (!raw || typeof raw !== 'object') throw new UnsupportedTorrentMedia();
  const data = raw as {
    streams?: unknown;
    format?: { duration?: unknown; start_time?: unknown; bit_rate?: unknown };
  };
  if (!Array.isArray(data.streams) || data.streams.length > 64) throw new UnsupportedTorrentMedia();
  const streams = data.streams as Stream[];
  const video = streams.find(
    (stream) =>
      stream.codec_type === 'video' &&
      !(stream.disposition as { attached_pic?: unknown })?.attached_pic,
  );
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
    height > 2160 ||
    width * height > 4096 * 2160
  )
    throw new UnsupportedTorrentMedia();
  const hdr =
    ['smpte2084', 'arib-std-b67'].includes(String(video.color_transfer)) ||
    video.color_primaries === 'bt2020' ||
    ['bt2020nc', 'bt2020c'].includes(String(video.color_space)) ||
    (Array.isArray(video.side_data_list) ? video.side_data_list : []).some((item) =>
      /dovi|dolby|mastering display|content light|hdr/i.test(String(item.side_data_type)),
    );
  const rates = [video.avg_frame_rate, video.r_frame_rate].map((value) => {
    const rate = (typeof value === 'string' ? value : '').split('/').map(Number);
    return rate.length === 2 && rate[1] > 0 ? rate[0] / rate[1] : 0;
  });
  const fps = Math.max(...rates);
  if (
    !Number.isFinite(fps) ||
    fps <= 0 ||
    fps > 60 ||
    typeof video.codec_name !== 'string' ||
    !/^[a-z0-9_]{1,24}$/.test(video.codec_name)
  )
    throw new UnsupportedTorrentMedia();
  const pixelDepth = /p0?(9|10|12|14|16)/.exec(String(video.pix_fmt));
  const bitDepth = Number(video.bits_per_raw_sample) || Number(pixelDepth?.[1] ?? 8);
  if (!Number.isInteger(bitDepth) || bitDepth < 8 || bitDepth > 16)
    throw new UnsupportedTorrentMedia();
  const videoInfo: TorrentVideoProbe = {
    codec: video.codec_name,
    profile: typeof video.profile === 'string' ? video.profile : '',
    pixelFormat: typeof video.pix_fmt === 'string' ? video.pix_fmt : '',
    bitDepth,
    width,
    height,
    fps,
    level: bitrate(video.level),
    bitrate: bitrate(video.bit_rate) ?? bitrate(data.format?.bit_rate),
    dynamicRange: hdr ? 'hdr' : 'sdr',
  };
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
      if (channels !== null && (channels < 1 || channels > 32)) throw new UnsupportedTorrentMedia();
      return {
        trackRef: `torrent_track_${randomBytes(16).toString('base64url')}`,
        streamIndex: Number(stream.index),
        label,
        language,
        channels,
        profile: typeof stream.profile === 'string' ? stream.profile : '',
        sampleRate: Number(stream.sample_rate) || 0,
        bitrate: bitrate(stream.bit_rate),
        codec:
          typeof stream.codec_name === 'string' && /^[a-z0-9_]{1,24}$/.test(stream.codec_name)
            ? stream.codec_name
            : 'unknown',
        isDefault: stream.disposition?.default === 1,
        copy:
          stream.codec_name === 'aac' &&
          stream.profile === 'LC' &&
          channels !== null &&
          channels >= 1 &&
          channels <= 2 &&
          Number(stream.sample_rate) > 0 &&
          Number(stream.sample_rate) <= 48_000 &&
          bitrate(stream.bit_rate) !== null &&
          bitrate(stream.bit_rate)! <= 320_000,
      };
    });
  if (audioTracks.length === 0 || audioTracks.length > 32) throw new UnsupportedTorrentMedia();
  const streamDuration = Number(video.duration);
  const duration =
    Number.isFinite(streamDuration) && streamDuration > 0
      ? streamDuration
      : Number(data.format?.duration);
  return selectTorrentOutput(
    {
      fileRef,
      durationSeconds: Number.isFinite(duration) && duration > 0 ? duration : null,
      sourceStartSeconds: Number.isFinite(Number(data.format?.start_time))
        ? Number(data.format?.start_time)
        : 0,
      videoStreamIndex: Number(video.index),
      copyVideo: false,
      video: videoInfo,
      audioTracks,
      ...probeSubtitles(data.streams as Array<Record<string, unknown>>),
    },
    'h264-720p',
  );
}
