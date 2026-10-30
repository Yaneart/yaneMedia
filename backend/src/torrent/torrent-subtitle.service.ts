import { HttpException, Injectable, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import type { EngineFileKey } from './torrent-engine.port';
import { TorrentSessionRepository } from './torrent-session.repository';
import {
  TorrentGatewayCapacity,
  TorrentGatewayTimeout,
  TorrentStreamGateway,
} from './torrent-stream.gateway';

@Injectable()
export class TorrentSubtitleService {
  private readonly logger = new Logger(TorrentSubtitleService.name);
  constructor(
    private readonly repository: TorrentSessionRepository,
    private readonly gateway: TorrentStreamGateway,
  ) {}

  async serve(
    owner: string,
    id: string,
    generation: string,
    ref: string,
    font: boolean,
    req: Request,
    res: Response,
  ) {
    const missing = () =>
      new HttpException(
        { code: 'TORRENT_SESSION_NOT_FOUND', message: 'TORRENT_SESSION_NOT_FOUND' },
        404,
      );
    if ((req.method && req.method !== 'GET') || req.originalUrl?.includes('?')) throw missing();
    if (
      !/^torrent_session_[A-Za-z0-9_-]{22}$/.test(id) ||
      !/^[1-9]\d{0,9}$/.test(generation) ||
      !(font ? /^torrent_font_[A-Za-z0-9_-]{22}$/ : /^torrent_subtitle_[A-Za-z0-9_-]{22}$/).test(
        ref,
      )
    )
      throw missing();
    const session = await this.repository.findVisible(owner, id);
    if (
      !session ||
      session.state !== 'ready' ||
      session.generation !== Number(generation) ||
      !session.playbackTimeline ||
      !session.selectedFileRef
    )
      throw missing();
    const probe = await this.repository.getProbe(id);
    if (!probe || probe.fileRef !== session.selectedFileRef) throw missing();
    const resource = font
      ? probe.subtitleFonts?.find((item) => item.fontRef === ref)
      : probe.subtitleTracks?.find((item) => item.trackRef === ref);
    const file = await this.repository.findFile(id, session.selectedFileRef);
    const key = await this.repository.findEngineKey(id);
    if (!resource || !file || !key) throw missing();
    if (req.headers.range !== undefined) {
      res.status(416).end();
      return;
    }
    const abort = new AbortController();
    const close = () => abort.abort();
    res.once('close', close);
    if (res.destroyed) abort.abort();
    const started = Date.now();
    try {
      const bytes = await this.gateway.subtitleResource(
        id,
        session.generation,
        {
          key,
          file: file.engineFileIndex as EngineFileKey,
          size: file.sizeBytes,
        },
        probe,
        resource,
        session.playbackTimeline.absoluteAnchorSeconds,
        abort.signal,
      );
      const current = await this.repository.findVisible(owner, id);
      if (
        !current ||
        current.state !== 'ready' ||
        current.generation !== session.generation ||
        current.selectedFileRef !== session.selectedFileRef
      )
        throw missing();
      if (abort.signal.aborted) return;
      res.setHeader(
        'Content-Type',
        font
          ? 'application/octet-stream'
          : 'format' in resource && resource.format === 'ass'
            ? 'text/x-ssa; charset=utf-8'
            : 'text/vtt; charset=utf-8',
      );
      res.setHeader('Content-Length', bytes.length);
      res.end(bytes);
    } catch (error) {
      if (abort.signal.aborted) return;
      if (error instanceof HttpException) throw error;
      const current = await this.repository.findVisible(owner, id);
      if (!current || current.state !== 'ready' || current.generation !== session.generation)
        throw missing();
      this.logger.warn({
        event: 'torrent.subtitle_failed',
        reason:
          error instanceof TorrentGatewayCapacity
            ? 'capacity'
            : error instanceof TorrentGatewayTimeout
              ? 'timeout'
              : 'extraction',
        durationMs: Date.now() - started,
      });
      if (error instanceof TorrentGatewayCapacity) {
        res.setHeader('Retry-After', '1');
        throw new HttpException(
          { code: 'TORRENT_CAPACITY_EXCEEDED', message: 'TORRENT_CAPACITY_EXCEEDED' },
          503,
        );
      }
      throw new HttpException(
        { code: 'TORRENT_SUBTITLE_UNAVAILABLE', message: 'TORRENT_SUBTITLE_UNAVAILABLE' },
        422,
      );
    } finally {
      res.removeListener('close', close);
    }
  }
}
