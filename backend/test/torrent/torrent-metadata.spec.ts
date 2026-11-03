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
  it('keeps season folders in safe relative names and never publishes an absolute path or traversal', () => {
    const files = mapTorrentFiles(
      status([
        [1, 'Show/Season 2/01.mkv', 100],
        [2, 'Show/Season 3/01.mkv', 100],
        [3, 'Show/Extras/trailer.mp4', 100],
      ]),
    );
    expect(files.map((file) => file.displayName)).toEqual([
      'Season 2/01.mkv',
      'Season 3/01.mkv',
      'Extras/trailer.mp4',
    ]);
    for (const path of ['/private/movie.mkv', 'C:\\private\\movie.mkv', 'root/../movie.mkv']) {
      expect(mapTorrentFiles(status([[1, path, 100]]))[0].displayName).toBe('movie.mkv');
    }
    expect(mapTorrentFiles(status([[1, 'Season 2/01.mkv', 100]]))[0].displayName).toBe(
      'Season 2/01.mkv',
    );
    expect(mapTorrentFiles(status([[1, '2 сезон/01.mkv', 100]]))[0].displayName).toBe(
      '2 сезон/01.mkv',
    );
    const long = mapTorrentFiles(
      status([
        [1, `Show/${'😀'.repeat(100)}/${'😀'.repeat(100)}/${'😀'.repeat(100)}/clip.mkv`, 100],
      ]),
    )[0].displayName;
    expect([...long]).toHaveLength(255);
    expect(long.endsWith('/clip.mkv')).toBe(true);
  });
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
    expect(() => mapTorrentFiles(status([[1, 'movie.mkv', 200 * 1024 ** 3 + 1]]))).toThrow(
      new TorrentMetadataError('TORRENT_SIZE_LIMIT_EXCEEDED'),
    );
    const huge = status([[1, 'movie.mkv', 10]]);
    huge.totalBytes = 200 * 1024 ** 3 + 1;
    expect(() => mapTorrentFiles(huge)).toThrow(
      new TorrentMetadataError('TORRENT_SIZE_LIMIT_EXCEEDED'),
    );
  });

  it('accepts exactly 200 Гб and rejects a larger sum even when the engine total is understated', () => {
    const limit = 214748364800;
    expect(mapTorrentFiles(status([[1, 'movie.mkv', limit]]))[0].sizeBytes).toBe(limit);
    const inconsistent = status([
      [1, 'movie.mkv', limit],
      [2, 'extra.txt', 1],
    ]);
    inconsistent.totalBytes = limit;
    expect(() => mapTorrentFiles(inconsistent)).toThrow(
      new TorrentMetadataError('TORRENT_SIZE_LIMIT_EXCEEDED'),
    );
  });
});
