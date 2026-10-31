import { parseTorrentProbe } from '../../src/torrent/torrent-media-policy';
import {
  selectTorrentOutput,
  torrentOutputInfo,
  torrentNeedsUnsupportedTranscode,
} from '../../src/torrent/torrent-output-policy';
import {
  isTorrentClientCapabilities,
  torrentVideoContentType,
} from '../../src/torrent/torrent-client-capabilities';

const media = (video = {}, audio = {}) =>
  parseTorrentProbe('file', {
    streams: [
      {
        index: 0,
        codec_type: 'video',
        codec_name: 'h264',
        profile: 'High',
        level: 51,
        width: 3840,
        height: 2160,
        pix_fmt: 'yuv420p',
        avg_frame_rate: '24/1',
        ...video,
      },
      {
        index: 1,
        codec_type: 'audio',
        codec_name: 'ac3',
        channels: 6,
        sample_rate: '48000',
        bit_rate: '384000',
        ...audio,
      },
    ],
  });

describe('source-specific original video/audio negotiation', () => {
  it('extracts exact AVC and HEVC codec strings from decoder configuration', () => {
    expect(
      torrentVideoContentType('h264', '\n00000000: 0164 0033 ffe1 0019 6764 0033  .d.3\n'),
    ).toBe('video/mp4; codecs="avc1.640033"');
    expect(
      torrentVideoContentType('hevc', '\n00000000: 0102 2000 0000 b000 0000 0000 99f0  .\n'),
    ).toBe('video/mp4; codecs="hvc1.2.4.L153.B0"');
    expect(torrentVideoContentType('hevc', 'garbage')).toBeUndefined();
  });

  it.each([
    [2560, 1440],
    [3840, 1608],
    [3840, 2160],
    [4096, 2160],
  ])('keeps %ix%i without transcoding only with validated original support', (width, height) => {
    const probe = media({ width, height });
    probe.video!.contentType = 'video/mp4; codecs="avc1.640033"';
    const selected = selectTorrentOutput(probe, 'h264-1080p', {
      originalVideo: true,
      audio: 'aac-6',
    });
    expect(torrentNeedsUnsupportedTranscode(selected)).toBe(false);
    expect(torrentOutputInfo(selected, selected.audioTracks[0])).toMatchObject({
      video: { width, height, codec: 'h264', mode: 'copy' },
      audio: { codec: 'aac', channels: 6, mode: 'transcode' },
    });
    expect(torrentNeedsUnsupportedTranscode(selectTorrentOutput(probe, 'h264-1080p'))).toBe(true);
    delete probe.video!.contentType;
    expect(
      torrentNeedsUnsupportedTranscode(
        selectTorrentOutput(probe, 'h264-1080p', { originalVideo: true, audio: 'original' }),
      ),
    ).toBe(true);
  });

  it.each(['ac3', 'eac3', 'aac', 'dts', 'truehd'])(
    'negotiates %s independently of video',
    (codec) => {
      const probe = media({}, { codec_name: codec, profile: 'LC' });
      probe.video!.contentType = 'video/mp4; codecs="avc1.640033"';
      const selected = selectTorrentOutput(probe, 'h264-1080p', {
        originalVideo: true,
        audio: 'original',
      });
      expect(selected.copyVideo).toBe(true);
      expect(selected.audioTracks[0].copy).toBe(['aac', 'ac3', 'eac3'].includes(codec));
      expect(torrentOutputInfo(selected, selected.audioTracks[0])?.audio.channels).toBe(
        ['aac', 'ac3', 'eac3'].includes(codec) ? 6 : 2,
      );
    },
  );

  it('preserves Main 10 SDR and 7.1 while never upmixing a 5.1 source', () => {
    const probe = media(
      { codec_name: 'hevc', profile: 'Main 10', level: 153, pix_fmt: 'yuv420p10le' },
      { channels: 8 },
    );
    probe.video!.contentType = 'video/mp4; codecs="hvc1.2.4.L153.B0"';
    const selected = selectTorrentOutput(probe, 'h264-720p', {
      originalVideo: true,
      audio: 'aac-8',
    });
    expect(torrentOutputInfo(selected, selected.audioTracks[0])).toMatchObject({
      video: { codec: 'hevc', bitDepth: 10, mode: 'copy', width: 3840 },
      audio: { channels: 8 },
    });
    selected.audioTracks[0].channels = 6;
    expect(torrentOutputInfo(selected, selected.audioTracks[0])?.audio.channels).toBe(6);
  });

  it.each([
    null,
    [],
    { originalVideo: true, audio: 'dts' },
    { originalVideo: 'true', audio: 'aac-2' },
    { originalVideo: true, audio: 'aac-8', threads: 20 },
  ])('rejects unbounded client input %j', (value) => {
    expect(isTorrentClientCapabilities(value)).toBe(false);
  });

  it.each([
    { color_transfer: 'smpte2084' },
    { color_transfer: 'arib-std-b67' },
    { side_data_list: [{ side_data_type: 'DOVI configuration record' }] },
  ])('passes HDR through only with confirmed codec support, including below 1080p: %j', (video) => {
    for (const dimensions of [
      { width: 3840, height: 2160 },
      { width: 1280, height: 720, level: 41 },
    ]) {
      const probe = media({ ...video, ...dimensions });
      probe.video!.contentType = 'video/mp4; codecs="avc1.640029"';
      expect(torrentNeedsUnsupportedTranscode(selectTorrentOutput(probe, 'h264-1080p'))).toBe(true);
      const selected = selectTorrentOutput(probe, 'h264-1080p', {
        originalVideo: true,
        audio: 'aac-6',
      });
      expect(torrentNeedsUnsupportedTranscode(selected)).toBe(false);
      expect(torrentOutputInfo(selected, selected.audioTracks[0])).toMatchObject({
        source: { dynamicRange: 'hdr' },
        video: { dynamicRange: 'hdr', mode: 'copy' },
      });
    }
  });
});
