import { parseTorrentProbe, UnsupportedTorrentMedia } from '../../src/torrent/torrent-media-policy';
import { selectTorrentOutput, torrentOutputInfo } from '../../src/torrent/torrent-output-policy';

const media = {
  format: { duration: '42.25' },
  streams: [
    {
      index: 0,
      codec_type: 'video',
      codec_name: 'h264',
      profile: 'High',
      level: 40,
      pix_fmt: 'yuv420p',
      width: 1280,
      height: 720,
      avg_frame_rate: '24/1',
      bit_rate: '4000000',
    },
    {
      index: 1,
      codec_type: 'audio',
      codec_name: 'aac',
      profile: 'LC',
      sample_rate: '48000',
      bit_rate: '192000',
      channels: 2,
      tags: { language: 'eng', title: 'English' },
      disposition: { default: 1 },
    },
    {
      index: 2,
      codec_type: 'audio',
      codec_name: 'ac3',
      channels: 6,
      tags: { language: 'rus', title: '<Russian>\u0000' },
    },
    { index: 3, codec_type: 'subtitle', codec_name: 'subrip' },
  ],
};

describe('torrent FFmpeg probe policy', () => {
  it('keeps browser-compatible tracks and maps only probed audio to opaque refs', () => {
    const result = parseTorrentProbe('torrent_file_safe', media);
    expect(result.durationSeconds).toBe(42.25);
    expect(result.copyVideo).toBe(true);
    expect(result.audioTracks).toHaveLength(2);
    expect(result.audioTracks[0]).toMatchObject({
      streamIndex: 1,
      copy: true,
      language: 'eng',
      isDefault: true,
    });
    expect(result.audioTracks[1]).toMatchObject({ streamIndex: 2, copy: false, label: 'Russian' });
    expect(result.audioTracks[0].trackRef).toMatch(/^torrent_track_[A-Za-z0-9_-]{22}$/);
    expect(result.audioTracks[0].trackRef).not.toBe(result.audioTracks[1].trackRef);
  });

  it('copies compatible unknown bitrate video and rejects media without supported tracks', () => {
    const unknownBitrate = structuredClone(media);
    delete (unknownBitrate.streams[0] as { bit_rate?: string }).bit_rate;
    expect(parseTorrentProbe('file', unknownBitrate).copyVideo).toBe(true);
    expect(() => parseTorrentProbe('file', { streams: [media.streams[1]] })).toThrow(
      UnsupportedTorrentMedia,
    );
    expect(() => parseTorrentProbe('file', { streams: [media.streams[0]] })).toThrow(
      UnsupportedTorrentMedia,
    );
  });

  it('rejects invalid FFmpeg stream indexes', () => {
    expect(() =>
      parseTorrentProbe('file', {
        ...media,
        streams: [{ ...media.streams[0], index: -1 }, media.streams[1]],
      }),
    ).toThrow(UnsupportedTorrentMedia);
  });

  it('rejects excessive decoded dimensions before admitting a transcode', () => {
    for (const dimensions of [
      { width: 16384, height: 16384 },
      { width: 1920, height: 65536 },
    ])
      expect(() =>
        parseTorrentProbe('file', {
          ...media,
          streams: [{ ...media.streams[0], ...dimensions }, media.streams[1]],
        }),
      ).toThrow(UnsupportedTorrentMedia);
  });

  const probeVideo = (video: Record<string, unknown>, format = {}) =>
    parseTorrentProbe('file', {
      ...media,
      format: { ...media.format, ...format },
      streams: [{ ...media.streams[0], ...video }, ...media.streams.slice(1)],
    });

  it('remuxes compatible 1080p only for the negotiated profile, including MKV aggregate bitrate', () => {
    const probe = probeVideo(
      { width: 1920, height: 1080, level: 41, bit_rate: undefined },
      { bit_rate: '7000000' },
    );
    expect(probe.copyVideo).toBe(false);
    const selected = selectTorrentOutput(probe, 'h264-1080p');
    expect(selected.copyVideo).toBe(true);
    expect(torrentOutputInfo(selected, selected.audioTracks[0])).toMatchObject({
      profile: 'h264-1080p',
      video: { width: 1920, height: 1080, mode: 'copy', reason: 'compatible' },
      audio: { sourceCodec: 'aac', channels: 2, mode: 'copy' },
    });
    expect(torrentOutputInfo(probe, probe.audioTracks[1])).toMatchObject({
      video: { width: 1280, height: 720, mode: 'transcode', reason: 'resolution' },
      audio: { sourceCodec: 'ac3', sourceChannels: 6, channels: 2, reason: 'surround' },
    });
  });

  it.each([
    [{ codec_name: 'hevc', pix_fmt: 'yuv420p10le', bits_per_raw_sample: '10' }, 'codec'],
    [{ pix_fmt: 'yuv420p10le' }, 'pixel_format'],
    [{ profile: 'High 4:4:4 Predictive' }, 'profile'],
    [{ level: 51 }, 'level'],
    [{ level: undefined }, 'level'],
    [{ avg_frame_rate: '60/1' }, 'frame_rate'],
  ])('transcodes SDR for an explicit reason without upscaling: %j', (video, reason) => {
    const probe = selectTorrentOutput(probeVideo(video), 'h264-1080p');
    expect(probe.copyVideo).toBe(false);
    expect(torrentOutputInfo(probe, probe.audioTracks[0])).toMatchObject({
      video: {
        width: 1280,
        height: 720,
        fps: Math.min(30, probe.video!.fps),
        mode: 'transcode',
        reason,
      },
    });
  });

  it.each(['9000000', '50000000', undefined])(
    'preserves compatible 1080p at bitrate %s',
    (bit_rate) => {
      const probe = selectTorrentOutput(
        probeVideo({ width: 1920, height: 804, level: 41, bit_rate }),
        'h264-1080p',
      );
      expect(probe.copyVideo).toBe(true);
      expect(torrentOutputInfo(probe, probe.audioTracks[0])?.video).toMatchObject({
        width: 1920,
        height: 804,
        mode: 'copy',
        reason: 'compatible',
      });
    },
  );

  it.each([
    { color_transfer: 'smpte2084' },
    { color_transfer: 'arib-std-b67' },
    { color_primaries: 'bt2020' },
    { color_space: 'bt2020nc' },
    { side_data_list: [{ side_data_type: 'DOVI configuration record' }] },
    { side_data_list: [{ side_data_type: 'Mastering display metadata' }] },
    { width: 3840, height: 2160 },
    { avg_frame_rate: '120/1' },
    { avg_frame_rate: '24/1', r_frame_rate: '120/1' },
    { avg_frame_rate: '0/0' },
    { bits_per_raw_sample: '1000' },
  ])('rejects unsupported colour and decode budgets before output admission: %j', (video) => {
    expect(() => probeVideo(video)).toThrow(UnsupportedTorrentMedia);
  });
});
