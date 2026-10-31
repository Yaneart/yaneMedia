import { torrentDecodingContext } from './torrentOutputProfile';

export type TorrentClientCapabilities = {
  originalVideo: boolean;
  audio: 'original' | 'aac-2' | 'aac-6' | 'aac-8';
};
export type TorrentClientMedia = {
  video: {
    contentType: string | null;
    width: number;
    height: number;
    framerate: number;
    bitrate: number;
  };
  audio: {
    trackRef: string;
    contentType: string | null;
    channels: number | null;
    samplerate: number;
    bitrate: number;
  }[];
};

export async function torrentClientCapabilities(
  media: TorrentClientMedia,
  trackRef?: string,
): Promise<TorrentClientCapabilities> {
  const conservative: TorrentClientCapabilities = { originalVideo: false, audio: 'aac-2' };
  if (typeof document === 'undefined' || !navigator.mediaCapabilities?.decodingInfo)
    return conservative;
  const { native, supports } = torrentDecodingContext();
  const check = async (configuration: MediaDecodingConfiguration) => {
    try {
      const type = configuration.video?.contentType ?? configuration.audio?.contentType;
      if (!type || !supports(type)) return false;
      const result = await navigator.mediaCapabilities.decodingInfo(configuration);
      return result.supported && (!configuration.video || result.smooth);
    } catch {
      return false;
    }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let originalVideo = false;
  try {
    return await Promise.race([
      (async (): Promise<TorrentClientCapabilities> => {
        const type = native ? 'file' : 'media-source';
        originalVideo =
          media.video.contentType !== null &&
          (await check({
            type,
            video: { ...media.video, contentType: media.video.contentType },
          }));
        const track = media.audio.find((audio) => audio.trackRef === trackRef) ?? media.audio[0];
        if (!track) return { ...conservative, originalVideo };
        if (
          track.contentType &&
          track.channels &&
          (await check({
            type,
            audio: {
              contentType: track.contentType,
              channels: String(track.channels),
              samplerate: track.samplerate,
              bitrate: track.bitrate,
            },
          }))
        )
          return { originalVideo, audio: 'original' };
        for (const channels of [8, 6] as const) {
          if (
            (track.channels ?? 2) >= channels &&
            (await check({
              type,
              audio: {
                contentType: 'audio/mp4; codecs="mp4a.40.2"',
                channels: String(channels),
                samplerate: 48_000,
                bitrate: 512_000,
              },
            }))
          )
            return { originalVideo, audio: `aac-${channels}` };
        }
        return { originalVideo, audio: 'aac-2' };
      })(),
      new Promise<TorrentClientCapabilities>((resolve) => {
        timer = setTimeout(() => resolve({ originalVideo, audio: 'aac-2' }), 1500);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
