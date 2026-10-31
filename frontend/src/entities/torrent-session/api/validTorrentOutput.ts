import type { TorrentOutput } from '../model/torrentOutput';

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const number = (value: unknown, max: number, min = 1): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const integer = (value: unknown, max: number, min = 1) =>
  number(value, max, min) && Number.isInteger(value);
const codec = (value: unknown) => typeof value === 'string' && /^[a-z0-9_]{1,24}$/.test(value);
const keys = (value: Record<string, unknown>, allowed: string[]) =>
  Object.keys(value).every((key) => allowed.includes(key));

export function validTorrentOutput(value: unknown): value is TorrentOutput {
  if (!record(value) || !['h264-720p', 'h264-1080p'].includes(String(value.profile))) return false;
  const { source, video, audio } = value;
  if (!record(source) || !record(video) || !record(audio)) return false;
  if (
    !keys(value, ['profile', 'source', 'video', 'audio']) ||
    !keys(source, ['codec', 'width', 'height', 'bitDepth', 'fps', 'dynamicRange']) ||
    !keys(video, [
      'codec',
      'bitDepth',
      'dynamicRange',
      'width',
      'height',
      'fps',
      'mode',
      'reason',
    ]) ||
    !keys(audio, ['codec', 'sourceCodec', 'sourceChannels', 'channels', 'mode', 'reason'])
  )
    return false;
  const full = value.profile === 'h264-1080p';
  return (
    codec(source.codec) &&
    integer(source.width, 4096, 16) &&
    integer(source.height, 2160, 16) &&
    integer(source.bitDepth, 16, 8) &&
    number(source.fps, 60, 0.001) &&
    ['sdr', 'hdr'].includes(String(source.dynamicRange)) &&
    (video.mode === 'copy'
      ? ['h264', 'hevc'].includes(String(video.codec)) &&
        video.codec === source.codec &&
        video.bitDepth === source.bitDepth &&
        (video.codec === 'h264' ? video.bitDepth === 8 : [8, 10].includes(Number(video.bitDepth)))
      : source.dynamicRange === 'sdr' &&
        video.codec === 'h264' &&
        video.bitDepth === 8 &&
        Number(source.width) <= 1920 &&
        Number(source.height) <= 1080) &&
    video.dynamicRange === source.dynamicRange &&
    integer(
      video.width,
      Math.min(Number(source.width), video.mode === 'copy' ? 4096 : full ? 1920 : 1280),
      2,
    ) &&
    integer(
      video.height,
      Math.min(Number(source.height), video.mode === 'copy' ? 2160 : full ? 1080 : 720),
      2,
    ) &&
    number(video.fps, Math.min(video.mode === 'copy' ? 60 : 30, Number(source.fps)), 0.001) &&
    ['copy', 'transcode'].includes(String(video.mode)) &&
    [
      'compatible',
      'codec',
      'pixel_format',
      'profile',
      'resolution',
      'frame_rate',
      'level',
      'bitrate',
      'dynamic_range',
    ].includes(String(video.reason)) &&
    (video.mode !== 'copy' ||
      (video.reason === 'compatible' &&
        video.width === source.width &&
        video.height === source.height &&
        video.fps === source.fps)) &&
    ['aac', 'ac3', 'eac3'].includes(String(audio.codec)) &&
    (audio.mode === 'copy' ? audio.codec === audio.sourceCodec : audio.codec === 'aac') &&
    codec(audio.sourceCodec) &&
    (audio.sourceChannels === null || integer(audio.sourceChannels, 32)) &&
    integer(audio.channels, 8) &&
    (audio.sourceChannels === null || Number(audio.channels) <= Number(audio.sourceChannels)) &&
    ['copy', 'transcode'].includes(String(audio.mode)) &&
    ['compatible', 'surround', 'compatibility'].includes(String(audio.reason)) &&
    (audio.mode !== 'copy' ||
      (audio.reason === 'compatible' && audio.sourceChannels === audio.channels))
  );
}
