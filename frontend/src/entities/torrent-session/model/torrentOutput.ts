export type TorrentOutputProfile = 'h264-720p' | 'h264-1080p';
export type TorrentOutput = {
  profile: TorrentOutputProfile;
  source: {
    codec: string;
    width: number;
    height: number;
    bitDepth: number;
    fps: number;
    dynamicRange: 'sdr' | 'hdr';
  };
  video: {
    codec: string;
    bitDepth: number;
    dynamicRange: 'sdr' | 'hdr';
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
      | 'bitrate'
      | 'dynamic_range';
  };
  audio: {
    codec: string;
    sourceCodec: string;
    sourceChannels: number | null;
    channels: number;
    mode: 'copy' | 'transcode';
    reason: 'compatible' | 'surround' | 'compatibility';
  };
};
