export type TorrentOutputProfile = 'h264-720p' | 'h264-1080p';
export type TorrentOutput = {
  profile: TorrentOutputProfile;
  source: {
    codec: string;
    width: number;
    height: number;
    bitDepth: number;
    fps: number;
    dynamicRange: 'sdr';
  };
  video: {
    codec: 'h264';
    bitDepth: 8;
    dynamicRange: 'sdr';
    width: number;
    height: number;
    fps: number;
    mode: 'copy' | 'transcode';
    reason:
      | 'compatible'
      | 'codec'
      | 'pixel_format'
      | 'profile'
      | 'resolution'
      | 'frame_rate'
      | 'level'
      | 'bitrate';
  };
  audio: {
    codec: 'aac';
    sourceCodec: string;
    sourceChannels: number | null;
    channels: number;
    mode: 'copy' | 'transcode';
    reason: 'compatible' | 'surround' | 'compatibility';
  };
};
