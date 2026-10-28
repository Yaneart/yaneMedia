import { HttpException, Injectable } from '@nestjs/common';
import type { EngineFileKey } from './torrent-engine.port';
import { TorrentInputService } from './torrent-input.service';
import type { TorrentSessionRow } from './torrent-session.entity';
import {
  TorrentSessionConflict,
  TorrentSessionNotFound,
  TorrentSessionRepository,
} from './torrent-session.repository';
import {
  TorrentGatewayCapacity,
  TorrentGatewayTimeout,
  TorrentStreamGateway,
} from './torrent-stream.gateway';

@Injectable()
export class TorrentPlaybackService {
  constructor(
    private readonly repository: TorrentSessionRepository,
    private readonly input: TorrentInputService,
    private readonly gateway: TorrentStreamGateway,
  ) {}

  async selectFile(ownerId: string, sessionId: string, body: unknown) {
    const request = body as { fileRef?: unknown; expectedVersion?: unknown };
    if (
      !request ||
      typeof request !== 'object' ||
      Object.keys(request).some((key) => !['fileRef', 'expectedVersion'].includes(key)) ||
      typeof request.fileRef !== 'string' ||
      !Number.isSafeInteger(request.expectedVersion) ||
      (request.expectedVersion as number) < 1
    )
      throw this.error(400, 'VALIDATION_FAILED');
    try {
      const session = await this.repository.selectFile(
        ownerId,
        sessionId,
        request.fileRef,
        request.expectedVersion as number,
      );
      if (session.state === 'probing') await this.gateway.stop(sessionId);
      return this.input.view(session);
    } catch (error) {
      this.mapError(error);
    }
  }

  async playback(ownerId: string, sessionId: string, body: unknown, key: string) {
    const request = body as {
      startPositionSeconds?: unknown;
      audioTrackRef?: unknown;
      expectedVersion?: unknown;
    };
    if (
      !/^[\x21-\x7e]{16,128}$/.test(key) ||
      !request ||
      typeof request !== 'object' ||
      Object.keys(request).some(
        (field) => !['startPositionSeconds', 'audioTrackRef', 'expectedVersion'].includes(field),
      ) ||
      !Number.isFinite(request.startPositionSeconds) ||
      (request.startPositionSeconds as number) < 0 ||
      !Number.isSafeInteger(request.expectedVersion) ||
      (request.expectedVersion as number) < 1 ||
      (request.audioTrackRef !== undefined && typeof request.audioTrackRef !== 'string')
    )
      throw this.error(400, 'VALIDATION_FAILED');
    const position = request.startPositionSeconds as number;
    try {
      const session = await this.repository.findVisible(ownerId, sessionId);
      if (!session) throw new TorrentSessionNotFound();
      const probe = await this.repository.getProbe(sessionId);
      if (!probe) throw new TorrentSessionNotFound();
      const trackRef =
        request.audioTrackRef ?? session.selectedAudioTrackRef ?? probe.audioTracks[0].trackRef;
      const audio = probe.audioTracks.find((track) => track.trackRef === trackRef);
      if (!audio) throw new TorrentSessionNotFound();
      const digest = this.input.digestPlayback(sessionId, position, trackRef);
      const replaySession = await this.repository.findReplay(ownerId, 'playback', key, digest);
      if (replaySession) return this.input.view(replaySession);
      if (
        !this.gateway.hasCapacity(
          !probe.copyVideo,
          session.state === 'ready' ? sessionId : undefined,
        )
      )
        throw this.error(503, 'TORRENT_CAPACITY_EXCEEDED');
      const { session: updated, replay } = await this.repository.beginPlayback(
        ownerId,
        sessionId,
        request.expectedVersion as number,
        trackRef,
        position,
        key,
        digest,
      );
      if (updated.state === 'preparing' && !replay) void this.start(updated).catch(() => undefined);
      return this.input.view(updated);
    } catch (error) {
      this.mapError(error);
    }
  }

  private async start(session: TorrentSessionRow): Promise<void> {
    try {
      const probe = await this.repository.getProbe(session.sessionId);
      const file =
        session.selectedFileRef &&
        (await this.repository.findFile(session.sessionId, session.selectedFileRef));
      const key = await this.repository.findEngineKey(session.sessionId);
      const audio = probe?.audioTracks.find(
        (track) => track.trackRef === session.selectedAudioTrackRef,
      );
      if (!probe || !file || !key || !audio) throw new Error('Missing playback source');
      await this.gateway.start(
        session.sessionId,
        session.generation,
        { key, file: file.engineFileIndex as EngineFileKey, size: file.sizeBytes },
        probe,
        audio,
        session.playbackPositionSeconds ?? 0,
      );
      const playbackTimeline = await this.gateway.waitReady(
        session.sessionId,
        session.generation,
        AbortSignal.timeout(90_000),
      );
      await this.repository.transition(session.sessionId, session.version, 'ready', {
        playbackTimeline,
      });
    } catch (error) {
      await this.gateway.stop(session.sessionId, session.generation);
      await this.repository
        .transition(session.sessionId, session.version, 'awaiting_playback', {
          failureCode:
            error instanceof TorrentGatewayCapacity
              ? 'TORRENT_CAPACITY_EXCEEDED'
              : error instanceof TorrentGatewayTimeout
                ? 'TORRENT_PLAYBACK_TIMEOUT'
                : 'TORRENT_TRANSCODE_FAILED',
        })
        .catch(() => undefined);
    }
  }

  private mapError(error: unknown): never {
    if (error instanceof TorrentSessionNotFound) throw this.error(404, error.message);
    if (error instanceof TorrentSessionConflict)
      throw new HttpException(
        {
          code: error.code,
          message: error.code,
          ...(error.version === undefined ? {} : { details: { version: error.version } }),
        },
        error.code === 'TORRENT_CAPACITY_EXCEEDED' ? 503 : 409,
      );
    throw error;
  }

  private error(status: number, code: string) {
    return new HttpException({ code, message: code }, status);
  }
}
