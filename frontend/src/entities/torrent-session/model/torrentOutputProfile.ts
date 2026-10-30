import { ApiClientError } from '@/shared/api';
import type { TorrentOutputProfile } from './torrentOutput';

// A performance hint chooses between fixed server profiles; it never grants
// arbitrary codecs, dimensions, bitrates or access to server-side resources.
export async function torrentOutputProfile(): Promise<TorrentOutputProfile> {
  if (typeof document === 'undefined') return 'h264-720p';
  const video = document.createElement('video');
  const mse =
    (globalThis as { ManagedMediaSource?: typeof MediaSource }).ManagedMediaSource ??
    globalThis.MediaSource;
  const videoType = 'video/mp4; codecs="avc1.640029"';
  const audioType = 'audio/mp4; codecs="mp4a.40.2"';
  // Match the player's MSE-first HLS policy, including Safari's ManagedMediaSource.
  const native =
    !(mse?.isTypeSupported(videoType) && mse?.isTypeSupported(audioType)) &&
    Boolean(video.canPlayType('application/vnd.apple.mpegurl'));
  const supports = (mime: string) =>
    native ? Boolean(video.canPlayType(mime)) : Boolean(mse?.isTypeSupported(mime));
  const unsupported = () =>
    new ApiClientError(
      'Браузер не поддерживает H.264/AAC для этого потока.',
      415,
      'TORRENT_UNSUPPORTED_MEDIA',
    );
  if (!supports(videoType) || !supports(audioType)) throw unsupported();
  const capabilities = navigator.mediaCapabilities;
  if (!capabilities?.decodingInfo) return 'h264-720p';
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const check = async (): Promise<TorrentOutputProfile> => {
      for (const [profile, width, height] of [
        ['h264-1080p', 1920, 1080],
        ['h264-720p', 1280, 720],
      ] as const) {
        const info = await capabilities.decodingInfo({
          type: native ? 'file' : 'media-source',
          // H.264 High 4.1 envelope, including compatible high-bitrate originals.
          video: { contentType: videoType, width, height, bitrate: 62_500_000, framerate: 30 },
          audio: { contentType: audioType, channels: '2', bitrate: 320_000, samplerate: 48_000 },
        });
        if (info.supported && info.smooth) return profile;
      }
      throw unsupported();
    };
    return await Promise.race([
      check(),
      new Promise<TorrentOutputProfile>((resolve) => {
        timer = setTimeout(() => resolve('h264-720p'), 750);
      }),
    ]);
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    return 'h264-720p';
  } finally {
    clearTimeout(timer);
  }
}
