import { readFile, readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import {
  InvalidTorrentPlaylist,
  parseTorrentPlaylist,
  type ParsedTorrentPlaylist,
} from './torrent-hls-playlist';
import {
  TORRENT_SEGMENT_BYTES,
  TORRENT_WINDOW_BYTES,
  TORRENT_WINDOW_SEGMENTS,
} from './torrent-playback-window';

type Segment = ParsedTorrentPlaylist['segments'][number] & { start: number; end: number };

// The encoder clock never restarts. Evict only behind the confirmed playhead,
// rather than behind download requests (which can run ahead of a paused viewer).
export class TorrentSegmentBuffer {
  private readonly segments = new Map<number, Segment>();
  private next = 0;
  private targetDuration = 2;
  private ended = false;
  private operation: Promise<unknown> = Promise.resolve();
  position: number;
  edge: number;
  bytes = 0;
  count = 0;

  constructor(
    readonly directory: string,
    readonly anchor: number,
    position: number,
  ) {
    this.edge = anchor;
    this.position = position;
  }

  confirm(position: number): boolean {
    if (!Number.isFinite(position) || position < this.anchor - 0.5 || position > this.edge + 0.5)
      return false;
    this.position = Math.max(this.anchor, position);
    return true;
  }

  refresh(): Promise<ParsedTorrentPlaylist> {
    const result = this.operation.then(() => this.read());
    this.operation = result.catch(() => undefined);
    return result;
  }

  private async read(): Promise<ParsedTorrentPlaylist> {
    const file = join(this.directory, 'media.m3u8');
    if ((await stat(file)).size > 16_384) throw new InvalidTorrentPlaylist();
    const raw = parseTorrentPlaylist(await readFile(file, 'utf8'));
    for (let index = 0; index < raw.segments.length; index++) {
      const sequence = raw.mediaSequence + index;
      if (sequence < this.next) continue;
      if (sequence !== this.next) throw new InvalidTorrentPlaylist();
      const item = raw.segments[index];
      const end = this.edge + Number(item.duration.slice(8, -1));
      this.segments.set(sequence, { ...item, start: this.edge, end });
      this.edge = end;
      this.next++;
    }
    this.ended = raw.ended;
    this.targetDuration = Math.max(this.targetDuration, raw.targetDuration);
    for (const [sequence, segment] of this.segments) {
      if (segment.end > this.position - 8 || this.segments.size <= 3) break;
      await unlink(join(this.directory, segment.filename)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'ENOENT') throw error;
      });
      this.segments.delete(sequence);
    }
    const files = await readdir(this.directory);
    const sizes = await Promise.all(
      files.map((name) =>
        stat(join(this.directory, name)).catch((error: NodeJS.ErrnoException) => {
          // FFmpeg atomically renames its unfinished fragment and playlist.
          if (error.code === 'ENOENT') return undefined;
          throw error;
        }),
      ),
    );
    this.bytes = sizes.reduce((sum, info) => sum + (info?.size ?? 0), 0);
    this.count = files.filter((name) => /^segment-\d{6}\.m4s$/.test(name)).length;
    if (
      this.bytes > TORRENT_WINDOW_BYTES ||
      this.count > TORRENT_WINDOW_SEGMENTS ||
      sizes.some(
        (info, index) =>
          /^segment-/.test(files[index]) && (info?.size ?? 0) > TORRENT_SEGMENT_BYTES,
      )
    )
      throw new InvalidTorrentPlaylist();
    return {
      targetDuration: this.targetDuration,
      mediaSequence: (this.segments.keys().next().value as number | undefined) ?? raw.mediaSequence,
      segments: [...this.segments.values()].map(({ filename, duration }) => ({
        filename,
        duration,
      })),
      ended: this.ended,
    };
  }
}
