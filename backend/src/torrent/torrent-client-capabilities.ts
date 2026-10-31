import type { AudioTrack, TorrentProbe } from './torrent-media-policy';

export type TorrentClientCapabilities = {
  originalVideo: boolean;
  audio: 'original' | 'aac-2' | 'aac-6' | 'aac-8';
};

export function isTorrentClientCapabilities(value: unknown): value is TorrentClientCapabilities {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    Object.keys(item).length === 2 &&
    typeof item.originalVideo === 'boolean' &&
    ['original', 'aac-2', 'aac-6', 'aac-8'].includes(String(item.audio))
  );
}

// Read the MP4 decoder configuration, not a guessed codec string from a filename.
export function torrentVideoContentType(codec: string, dump: string): string | undefined {
  const hex = dump
    .split('\n')
    .map(
      (line) => /^\s*[0-9a-f]{8}: ((?:[0-9a-f]{2,4} ?)+)/i.exec(line)?.[1]?.replace(/ /g, '') ?? '',
    )
    .join('');
  const bytes = Buffer.from(hex, 'hex');
  if (bytes[0] !== 1) return;
  if (codec === 'h264' && bytes.length >= 4)
    return `video/mp4; codecs="avc1.${bytes.subarray(1, 4).toString('hex')}"`;
  if (codec !== 'hevc' || bytes.length < 13 || bytes[1] >> 6 !== 0) return;
  let compatibility = 0;
  const flags = bytes.readUInt32BE(2);
  for (let bit = 0; bit < 32; bit++) compatibility = compatibility * 2 + ((flags >>> bit) & 1);
  const constraints = [...bytes.subarray(6, 12)];
  while (constraints.at(-1) === 0) constraints.pop();
  const suffix = constraints.map((byte) => byte.toString(16).toUpperCase()).join('.');
  return `video/mp4; codecs="hvc1.${bytes[1] & 31}.${compatibility.toString(16).toUpperCase()}.${bytes[1] & 32 ? 'H' : 'L'}${bytes[12]}${suffix ? `.${suffix}` : ''}"`;
}

export function originalAudioType(audio: AudioTrack): string | undefined {
  if (!audio.channels || audio.channels > 8 || !audio.sampleRate || audio.sampleRate > 48_000)
    return;
  if (audio.codec === 'aac' && audio.profile === 'LC') return 'audio/mp4; codecs="mp4a.40.2"';
  if (audio.codec === 'ac3') return 'audio/mp4; codecs="ac-3"';
  if (audio.codec === 'eac3') return 'audio/mp4; codecs="ec-3"';
}

export function torrentClientMedia(probe: TorrentProbe) {
  const video = probe.video;
  return video
    ? {
        video: {
          contentType: video.contentType ?? null,
          width: video.width,
          height: video.height,
          framerate: video.fps,
          bitrate: video.bitrate ?? 100_000_000,
        },
        audio: probe.audioTracks.map((audio) => ({
          trackRef: audio.trackRef,
          contentType: originalAudioType(audio) ?? null,
          channels: audio.channels,
          samplerate: audio.sampleRate || 48_000,
          bitrate: audio.bitrate ?? 1_536_000,
        })),
      }
    : undefined;
}
