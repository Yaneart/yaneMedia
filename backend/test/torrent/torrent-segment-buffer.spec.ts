import { mkdtemp, readFile, rm, writeFile, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TorrentSegmentBuffer } from '../../src/torrent/torrent-segment-buffer';
import { InvalidTorrentPlaylist } from '../../src/torrent/torrent-hls-playlist';

const name = (index: number) => `segment-${String(index).padStart(6, '0')}.m4s`;
const playlist = (start: number, end: number) =>
  [
    '#EXTM3U',
    '#EXT-X-VERSION:7',
    '#EXT-X-TARGETDURATION:2',
    `#EXT-X-MEDIA-SEQUENCE:${start}`,
    '#EXT-X-INDEPENDENT-SEGMENTS',
    '#EXT-X-MAP:URI="init.mp4"',
    ...Array.from(
      { length: end - start },
      (_, index) => `#EXTINF:2.000000,\n${name(start + index)}`,
    ),
    '',
  ].join('\n');

describe('continuous torrent segment buffer', () => {
  it('keeps the encoder clock across rolling playlists and evicts only behind the confirmed viewer', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'torrent-buffer-'));
    const buffer = new TorrentSegmentBuffer(directory, 40, 40);
    try {
      await writeFile(join(directory, 'init.mp4'), 'init');
      for (let index = 0; index < 85; index++) {
        await writeFile(join(directory, name(index)), `fragment-${index}`);
        await writeFile(
          join(directory, 'media.m3u8'),
          playlist(Math.max(0, index - 63), index + 1),
        );
        if (index > 12) expect(buffer.confirm(40 + (index - 8) * 2)).toBe(true);
        const current = await buffer.refresh();
        expect(current.ended).toBe(false);
        expect(buffer.edge).toBe(40 + (index + 1) * 2);
        if (index < 12) expect(current.mediaSequence).toBe(0);
        expect(current.segments.length).toBeLessThanOrEqual(22);
      }
      const before = await buffer.refresh();
      expect(before.mediaSequence).toBeGreaterThan(64);
      const retained = before.segments.map((segment) => segment.filename);
      // Downloading/reloading playlists while paused does not advance eviction.
      await Promise.all([buffer.refresh(), buffer.refresh()]);
      expect((await buffer.refresh()).segments.map((segment) => segment.filename)).toEqual(
        retained,
      );
      await expect(readFile(join(directory, name(0)))).rejects.toMatchObject({ code: 'ENOENT' });
      expect(buffer.confirm(buffer.edge + 10)).toBe(false);
      expect(buffer.confirm(NaN)).toBe(false);
      expect(buffer.confirm(39)).toBe(false);
      // A local seek into the browser's back buffer is valid feedback too.
      expect(buffer.confirm(45)).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('rejects sequence gaps and oversized unfinished fragments', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'torrent-buffer-'));
    try {
      await writeFile(join(directory, 'media.m3u8'), playlist(1, 2));
      await expect(new TorrentSegmentBuffer(directory, 0, 0).refresh()).rejects.toBeInstanceOf(
        InvalidTorrentPlaylist,
      );
      await writeFile(join(directory, 'media.m3u8'), playlist(0, 1));
      await writeFile(join(directory, name(0)), 'fragment');
      await writeFile(join(directory, `${name(1)}.tmp`), '');
      await truncate(join(directory, `${name(1)}.tmp`), 32 * 1024 * 1024 + 1);
      await expect(new TorrentSegmentBuffer(directory, 0, 0).refresh()).rejects.toBeInstanceOf(
        InvalidTorrentPlaylist,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
