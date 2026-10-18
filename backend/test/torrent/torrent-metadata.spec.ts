import { mapTorrentFiles, TorrentMetadataError } from '../../src/torrent/torrent-metadata';
import type {
  EngineTorrentStatus,
  EngineFileKey,
  EngineTorrentKey,
} from '../../src/torrent/torrent-engine.port';

const status = (files: Array<[number, string, number]>): EngineTorrentStatus => ({
  key: 'a'.repeat(40) as EngineTorrentKey,
  state: 'working',
  loadedBytes: 0,
  totalBytes: files.reduce((sum, file) => sum + file[2], 0),
  downloadBytesPerSecond: 0,
  activePeers: 0,
  connectedSeeders: 0,
  files: files.map(([key, path, length]) => ({ key: key as EngineFileKey, path, length })),
});

describe('torrent metadata mapping', () => {
  it('publishes only video with opaque refs and sanitized basenames', () => {
    const files = mapTorrentFiles(
      status([
        [1, 'root\\.pad\\padded.mkv', 100],
        [2, 'root/readme.txt', 10],
        [3, 'root/movie\u202e.mkv', 200],
        [4, 'root/empty.mp4', 0],
      ]),
    );
    expect(files).toEqual([
      { fileRef: files[0].fileRef, engineFileIndex: 3, displayName: 'movie.mkv', sizeBytes: 200 },
    ]);
    expect(files[0].fileRef).toMatch(/^torrent_file_[A-Za-z0-9_-]{22}$/);
    expect(files[0].fileRef).not.toContain('movie');
  });

  it('rejects absent video and oversized engine metadata', () => {
    expect(() => mapTorrentFiles(status([[1, 'readme.txt', 10]]))).toThrow(
      new TorrentMetadataError('TORRENT_NO_VIDEO_FILES'),
    );
    expect(() => mapTorrentFiles(status([[1, 'movie.mkv', 30 * 1024 ** 3 + 1]]))).toThrow(
      new TorrentMetadataError('TORRENT_SIZE_LIMIT_EXCEEDED'),
    );
    const huge = status([[1, 'movie.mkv', 10]]);
    huge.totalBytes = 200 * 1024 ** 3 + 1;
    expect(() => mapTorrentFiles(huge)).toThrow(
      new TorrentMetadataError('TORRENT_SIZE_LIMIT_EXCEEDED'),
    );
  });
});
