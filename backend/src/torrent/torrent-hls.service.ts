import { randomBytes } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { HttpException, Injectable, type BeforeApplicationShutdown } from '@nestjs/common';
import type { Request, Response } from 'express';
import { InvalidTorrentPlaylist, type ParsedTorrentPlaylist } from './torrent-hls-playlist';
import { TorrentSessionRepository } from './torrent-session.repository';
import { TorrentStreamGateway } from './torrent-stream.gateway';
import { TorrentMetrics } from './torrent-metrics';
import { TORRENT_SEGMENT_BYTES } from './torrent-playback-window';

type Manifest = {
  generation: number;
  playlistRef: string;
  initRef: string;
  segments: Map<string, string>;
  audioPlaylists: Map<string, string>;
  copies: Map<string, Manifest>;
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
    private readonly metrics: TorrentMetrics,
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
    let directory = this.gateway.artifactDirectory(sessionId, session.generation);
    if (!directory) throw missing();
    if ((this.active.get(sessionId) ?? 0) >= 8 || this.totalActive >= 16) {
      response.setHeader('Retry-After', '1');
      throw new HttpException({ code: 'RATE_LIMITED', message: 'RATE_LIMITED' }, 429);
    }
    this.active.set(sessionId, (this.active.get(sessionId) ?? 0) + 1);
    this.totalActive++;
    try {
      const root = this.manifest(sessionId, session.generation);
      let manifest = root;
      let artifactId = sessionId;
      const renditions = this.gateway.audioRenditions.get(sessionId, session.generation);
      if (renditions) {
        const copies = [renditions.audio, renditions.retired].filter((copy) => !!copy);
        for (const id of root.copies.keys())
          if (!copies.some((copy) => copy.id === id)) root.copies.delete(id);
        for (const copy of copies)
          if (!root.copies.has(copy.id)) root.copies.set(copy.id, newManifest(session.generation));
        for (const track of renditions.probe.audioTracks)
          if (!root.audioPlaylists.has(track.trackRef))
            root.audioPlaylists.set(track.trackRef, ref());
        if (kind === 'media' && handle !== root.playlistRef) {
          const track = [...root.audioPlaylists].find(([, value]) => value === handle)?.[0];
          const copy = copies.find((item) => item.ref === track);
          if (!copy) throw missing();
          artifactId = copy.id;
          manifest = root.copies.get(artifactId)!;
          handle = manifest.playlistRef;
        } else if (kind === 'init' || kind === 'segment') {
          for (const [id, copy] of root.copies) {
            if (
              kind === 'init'
                ? copy.initRef === handle
                : [...copy.segments.values()].includes(handle!)
            ) {
              artifactId = id;
              manifest = copy;
              break;
            }
          }
        }
        directory = this.gateway.artifactDirectory(artifactId, session.generation);
        if (!directory) throw missing();
      }
      if (
        kind !== 'master' &&
        handle !==
          (kind === 'media' ? manifest.playlistRef : kind === 'init' ? manifest.initRef : handle)
      )
        throw missing();
      if (kind === 'master') {
        const playlist = await this.refresh(
          sessionId,
          session.generation,
          directory,
          manifest,
          session.version,
        );
        const bandwidth = Math.max(
          1,
          ...(await Promise.all(
            playlist.segments.map(async (segment) =>
              Math.ceil(
                ((await stat(join(directory!, segment.filename))).size * 8) /
                  Number(segment.duration.slice(8, -1)),
              ),
            ),
          )),
        );
        await this.repository.recordViewerActivity(sessionId, session.generation);
        const base = `/api/v1/torrent-sessions/${sessionId}/hls`;
        sendPlaylist(
          response,
          `#EXTM3U\n#EXT-X-VERSION:7\n${
            renditions
              ? renditions.probe.audioTracks
                  .map((track, index) => {
                    const label = track.label.replace(/["\r\n]/g, "'");
                    const selected = renditions.audio?.ref === track.trackRef ? 'YES' : 'NO';
                    return `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="${label} (${index + 1})",DEFAULT=${selected},AUTOSELECT=${selected},URI="${base}/media/${root.audioPlaylists.get(track.trackRef)}.m3u8"\n`;
                  })
                  .join('')
              : ''
          }#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth}${renditions ? ',AUDIO="audio"' : ''}\n${base}/media/${manifest.playlistRef}.m3u8\n`,
          this.metrics,
        );
        return;
      }
      const playlist = await this.refresh(
        artifactId,
        session.generation,
        directory,
        manifest,
        session.version,
        sessionId,
      );
      const base = `/api/v1/torrent-sessions/${sessionId}/hls`;
      if (kind === 'media') {
        await this.repository.recordViewerActivity(sessionId, session.generation);
        const lines = [
          '#EXTM3U',
          '#EXT-X-VERSION:7',
          ...(session.playbackTimeline?.continuous ? [] : ['#EXT-X-PLAYLIST-TYPE:EVENT']),
          '#EXT-X-START:TIME-OFFSET=0,PRECISE=YES',
          `#EXT-X-TARGETDURATION:${playlist.targetDuration}`,
          `#EXT-X-MEDIA-SEQUENCE:${playlist.mediaSequence}`,
          '#EXT-X-INDEPENDENT-SEGMENTS',
          `#EXT-X-MAP:URI="${base}/init/${manifest.initRef}.mp4"`,
        ];
        const date = this.gateway.programDateTime(artifactId, session.generation);
        if (date) lines.push(`#EXT-X-PROGRAM-DATE-TIME:${date}`);
        for (const segment of playlist.segments) {
          lines.push(
            segment.duration,
            `${base}/segments/${manifest.segments.get(segment.filename)}.m4s`,
          );
        }
        if (playlist.ended && this.gateway.isCompleted(artifactId, session.generation))
          lines.push('#EXT-X-ENDLIST');
        sendPlaylist(response, `${lines.join('\n')}\n`, this.metrics);
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
        if (!info.isFile() || info.size <= 0 || info.size > TORRENT_SEGMENT_BYTES) throw missing();
        await this.repository.recordViewerActivity(sessionId, session.generation);
        response.setHeader('Content-Type', 'video/mp4');
        response.setHeader('Content-Length', String(info.size));
        const abort = new AbortController();
        this.streams.add(abort);
        const timer = setTimeout(() => abort.abort(), 30_000);
        response.once('close', () => abort.abort());
        try {
          const count = new Transform({
            transform: (chunk: Buffer, _encoding, callback) => {
              this.metrics.proxiedBytes(chunk.length);
              callback(null, chunk);
            },
          });
          await pipeline(createReadStream(file, { fd: fd.fd, autoClose: false }), count, response, {
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

  async progress(
    ownerId: string,
    sessionId: string,
    body: unknown,
    request: Request,
  ): Promise<void> {
    if (
      this.closing ||
      request.originalUrl.includes('?') ||
      request.headers['x-yanemedia-csrf'] !== '1' ||
      !/^torrent_session_[A-Za-z0-9_-]{22}$/.test(sessionId)
    )
      throw missing();
    const value = body as { generation?: unknown; positionSeconds?: unknown };
    if (
      !value ||
      typeof value !== 'object' ||
      Object.keys(value).some((key) => !['generation', 'positionSeconds'].includes(key)) ||
      !Number.isSafeInteger(value.generation) ||
      !Number.isFinite(value.positionSeconds) ||
      (value.positionSeconds as number) < 0
    )
      throw new HttpException({ code: 'VALIDATION_FAILED', message: 'VALIDATION_FAILED' }, 400);
    const session = await this.repository.findVisible(ownerId, sessionId);
    if (
      !session ||
      session.state !== 'ready' ||
      session.generation !== value.generation ||
      !session.playbackTimeline?.continuous ||
      !this.gateway.confirmPosition(sessionId, session.generation, value.positionSeconds as number)
    )
      throw missing();
    await this.repository.recordViewerActivity(sessionId, session.generation);
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
      manifest = newManifest(generation);
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
    ownerSessionId = sessionId,
  ) {
    const file = join(directory, 'media.m3u8');
    let playlist: ParsedTorrentPlaylist;
    try {
      if ((await stat(file)).size > 16_384) throw new InvalidTorrentPlaylist();
      playlist = await this.gateway.playlist(sessionId, generation);
    } catch (error) {
      if (error instanceof InvalidTorrentPlaylist) {
        await this.gateway.stop(ownerSessionId, generation);
        await this.repository
          .transition(ownerSessionId, version, 'awaiting_playback', {
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

function newManifest(generation: number): Manifest {
  return {
    generation,
    playlistRef: ref(),
    initRef: ref(),
    segments: new Map(),
    audioPlaylists: new Map(),
    copies: new Map(),
  };
}

function sendPlaylist(response: Response, body: string, metrics: TorrentMetrics): void {
  response.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
  response.end(body);
  metrics.proxiedBytes(Buffer.byteLength(body));
}
