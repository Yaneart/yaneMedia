import { parseTorrentProbe, UnsupportedTorrentMedia } from '../../src/torrent/torrent-media-policy';

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

  it('transcodes unknown bitrate video and rejects media without supported tracks', () => {
    const unknownBitrate = structuredClone(media);
    delete (unknownBitrate.streams[0] as { bit_rate?: string }).bit_rate;
    expect(parseTorrentProbe('file', unknownBitrate).copyVideo).toBe(false);
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
});
