import { randomBytes } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { open, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { HttpException, Injectable, type BeforeApplicationShutdown } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  InvalidTorrentPlaylist,
  parseTorrentPlaylist,
  type ParsedTorrentPlaylist,
} from './torrent-hls-playlist';
import { TorrentSessionRepository } from './torrent-session.repository';
import { TorrentStreamGateway } from './torrent-stream.gateway';

type Manifest = {
  generation: number;
  playlistRef: string;
  initRef: string;
  segments: Map<string, string>;
};
type Kind = 'master' | 'media' | 'init' | 'segment';
const ref = () => randomBytes(16).toString('base64url');
const missing = () =>
  new HttpException(
    { code: 'TORRENT_SESSION_NOT_FOUND', message: 'TORRENT_SESSION_NOT_FOUND' },
    404,
  );

@Injectable()
export class TorrentHlsService implements BeforeApplicationShutdown {
  private readonly manifests = new Map<string, Manifest>();
  private readonly active = new Map<string, number>();
  private totalActive = 0;
  private closing = false;
  private readonly streams = new Set<AbortController>();

  constructor(
    private readonly repository: TorrentSessionRepository,
    private readonly gateway: TorrentStreamGateway,
  ) {}

  async serve(
    ownerId: string,
    sessionId: string,
    kind: Kind,
    handle: string | undefined,
    request: Request,
    response: Response,
  ): Promise<void> {
    if (this.closing) throw missing();
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Vary', 'Cookie');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (
      request.method !== 'GET' ||
      request.originalUrl.includes('?') ||
      (kind !== 'master' && !/^[A-Za-z0-9_-]{22}$/.test(handle ?? ''))
    )
      throw missing();
    if (!/^torrent_session_[A-Za-z0-9_-]{22}$/.test(sessionId)) throw missing();
    const session = await this.repository.findVisible(ownerId, sessionId);
    if (!session || session.state !== 'ready') throw missing();
    if ((kind === 'init' || kind === 'segment') && request.headers.range !== undefined)
      throw new HttpException(
        { code: 'RANGE_NOT_SATISFIABLE', message: 'RANGE_NOT_SATISFIABLE' },
        416,
      );
    const directory = this.gateway.artifactDirectory(sessionId, session.generation);
    if (!directory) throw missing();
    if ((this.active.get(sessionId) ?? 0) >= 8 || this.totalActive >= 16) {
      response.setHeader('Retry-After', '1');
      throw new HttpException({ code: 'RATE_LIMITED', message: 'RATE_LIMITED' }, 429);
    }
    this.active.set(sessionId, (this.active.get(sessionId) ?? 0) + 1);
    this.totalActive++;
    try {
      const manifest = this.manifest(sessionId, session.generation);
      if (
        kind !== 'master' &&
        handle !==
          (kind === 'media' ? manifest.playlistRef : kind === 'init' ? manifest.initRef : handle)
      )
        throw missing();
      if (kind === 'master') {
        await this.refresh(sessionId, session.generation, directory, manifest, session.version);
        await this.repository.recordViewerActivity(sessionId, session.generation);
        const base = `/api/v1/torrent-sessions/${sessionId}/hls`;
        sendPlaylist(
          response,
          `#EXTM3U\n#EXT-X-VERSION:7\n#EXT-X-STREAM-INF:BANDWIDTH=10000000\n${base}/media/${manifest.playlistRef}.m3u8\n`,
        );
        return;
      }
      const playlist = await this.refresh(
        sessionId,
        session.generation,
        directory,
        manifest,
        session.version,
      );
      const base = `/api/v1/torrent-sessions/${sessionId}/hls`;
      if (kind === 'media') {
        await this.repository.recordViewerActivity(sessionId, session.generation);
        const lines = [
          '#EXTM3U',
          '#EXT-X-VERSION:7',
          `#EXT-X-TARGETDURATION:${playlist.targetDuration}`,
          `#EXT-X-MEDIA-SEQUENCE:${playlist.mediaSequence}`,
          '#EXT-X-INDEPENDENT-SEGMENTS',
          `#EXT-X-MAP:URI="${base}/init/${manifest.initRef}.mp4"`,
        ];
        for (const segment of playlist.segments) {
          lines.push(
            segment.duration,
            `${base}/segments/${manifest.segments.get(segment.filename)}.m4s`,
          );
        }
        if (playlist.ended && this.gateway.isCompleted(sessionId, session.generation))
          lines.push('#EXT-X-ENDLIST');
        sendPlaylist(response, `${lines.join('\n')}\n`);
        return;
      }
      const filename =
        kind === 'init'
          ? 'init.mp4'
          : [...manifest.segments].find(([, value]) => value === handle)?.[0];
      if (!filename) throw missing();
      const file = join(directory, filename);
      const fd = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => {
        throw missing();
      });
      try {
        const info = await fd.stat();
        if (!info.isFile() || info.size <= 0 || info.size > 32 * 1024 * 1024) throw missing();
        await this.repository.recordViewerActivity(sessionId, session.generation);
        response.setHeader('Content-Type', 'video/mp4');
        response.setHeader('Content-Length', String(info.size));
        const abort = new AbortController();
        this.streams.add(abort);
        const timer = setTimeout(() => abort.abort(), 30_000);
        response.once('close', () => abort.abort());
        try {
          await pipeline(createReadStream(file, { fd: fd.fd, autoClose: false }), response, {
            signal: abort.signal,
          });
        } catch {
          response.destroy();
        } finally {
          clearTimeout(timer);
          this.streams.delete(abort);
        }
      } finally {
        await fd.close();
      }
    } finally {
      const count = (this.active.get(sessionId) ?? 1) - 1;
      if (count) this.active.set(sessionId, count);
      else this.active.delete(sessionId);
      this.totalActive--;
    }
  }

  beforeApplicationShutdown(): void {
    this.closing = true;
    for (const stream of this.streams) stream.abort();
  }

  private manifest(sessionId: string, generation: number): Manifest {
    let manifest = this.manifests.get(sessionId);
    if (!manifest || manifest.generation !== generation) {
      if (this.manifests.size >= 64) {
        for (const key of this.manifests.keys()) {
          if (key !== sessionId && !this.active.has(key)) {
            this.manifests.delete(key);
            break;
          }
        }
      }
      manifest = { generation, playlistRef: ref(), initRef: ref(), segments: new Map() };
      this.manifests.set(sessionId, manifest);
    }
    return manifest;
  }

  private async refresh(
    sessionId: string,
    generation: number,
    directory: string,
    manifest: Manifest,
    version: number,
  ) {
    const file = join(directory, 'media.m3u8');
    let playlist: ParsedTorrentPlaylist;
    try {
      if ((await stat(file)).size > 16_384) throw new InvalidTorrentPlaylist();
      playlist = parseTorrentPlaylist(
        await readFile(file, { encoding: 'utf8', signal: AbortSignal.timeout(5_000) }),
      );
    } catch (error) {
      if (error instanceof InvalidTorrentPlaylist) {
        await this.gateway.stop(sessionId, generation);
        await this.repository
          .transition(sessionId, version, 'awaiting_playback', {
            failureCode: 'TORRENT_TRANSCODE_FAILED',
          })
          .catch(() => undefined);
      }
      throw missing();
    }
    if (!this.gateway.hasGeneration(sessionId, generation)) throw missing();
    const next = new Map<string, string>();
    for (const segment of playlist.segments)
      next.set(segment.filename, manifest.segments.get(segment.filename) ?? ref());
    manifest.segments = next;
    return playlist;
  }
}

function sendPlaylist(response: Response, body: string): void {
  response.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
  response.end(body);
}
