import type { TorrentClientMedia } from '../model/torrentClientCapabilities';

export function validTorrentClientMedia(value: unknown): value is TorrentClientMedia {
  const record = (item: unknown): item is Record<string, unknown> =>
    !!item && typeof item === 'object' && !Array.isArray(item);
  const number = (item: unknown, max: number) =>
    typeof item === 'number' && Number.isFinite(item) && item > 0 && item <= max;
  if (
    !record(value) ||
    !record(value.video) ||
    !Array.isArray(value.audio) ||
    value.audio.length > 32
  )
    return false;
  const video = value.video;
  return (
    (video.contentType === null ||
      (typeof video.contentType === 'string' &&
        /^video\/mp4; codecs="(?:avc1\.[0-9a-f]{6}|hvc1\.[12]\.[0-9A-F]+\.[LH]\d+(?:\.[0-9A-F]{1,2}){0,6})"$/.test(
          video.contentType,
        ))) &&
    number(video.width, 4096) &&
    Number.isInteger(video.width) &&
    number(video.height, 2160) &&
    Number.isInteger(video.height) &&
    number(video.framerate, 60) &&
    number(video.bitrate, 1e12) &&
    value.audio.every(
      (audio) =>
        record(audio) &&
        typeof audio.trackRef === 'string' &&
        audio.trackRef.length <= 128 &&
        (audio.contentType === null ||
          [
            'audio/mp4; codecs="mp4a.40.2"',
            'audio/mp4; codecs="ac-3"',
            'audio/mp4; codecs="ec-3"',
          ].includes(String(audio.contentType))) &&
        (audio.channels === null ||
          (number(audio.channels, 32) && Number.isInteger(audio.channels))) &&
        number(audio.samplerate, 768_000) &&
        number(audio.bitrate, 1e9),
    )
  );
}
