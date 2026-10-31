import { TorrentPlaybackService } from '../../src/torrent/torrent-playback.service';
import type { TorrentInputService } from '../../src/torrent/torrent-input.service';
import type { TorrentSessionRow } from '../../src/torrent/torrent-session.entity';
import {
  TorrentSessionConflict,
  TorrentSessionNotFound,
  type TorrentSessionRepository,
} from '../../src/torrent/torrent-session.repository';
import {
  TorrentGatewayCapacity,
  TorrentGatewayTimeout,
  type TorrentStreamGateway,
} from '../../src/torrent/torrent-stream.gateway';

describe('torrent playback commands', () => {
  const id = `torrent_session_${'a'.repeat(22)}`;
  const fileRef = `torrent_file_${'b'.repeat(22)}`;
  const trackRef = 'track-main';
  const key = 'playback-command-1';
  const session = {
    sessionId: id,
    state: 'awaiting_playback',
    version: 4,
    generation: 2,
    selectedFileRef: fileRef,
    selectedAudioTrackRef: trackRef,
    playbackPositionSeconds: 12,
  } as TorrentSessionRow;
  const audio = { trackRef, streamIndex: 1, copy: true };
  const probe = {
    copyVideo: true,
    audioTracks: [audio],
    video: {
      codec: 'h264',
      profile: 'High',
      pixelFormat: 'yuv420p',
      bitDepth: 8,
      width: 1280,
      height: 720,
      fps: 24,
      level: 40,
      bitrate: 4_000_000,
    },
  };
  const request = { startPositionSeconds: 12, expectedVersion: 4 };
  const timeline = { absoluteAnchorSeconds: 10, mediaAnchorSeconds: 0.08, windowEndSeconds: 130 };
  const repository = {
    findVisible: jest.fn(),
    getProbe: jest.fn(),
    findReplay: jest.fn(),
    beginPlayback: jest.fn(),
    findFile: jest.fn(),
    findEngineKey: jest.fn(),
    transition: jest.fn(),
    selectFile: jest.fn(),
  };
  const gateway = {
    hasCapacity: jest.fn(),
    start: jest.fn(),
    waitReady: jest.fn(),
    waitComplete: jest.fn(),
    stop: jest.fn(),
  };
  const input = { view: jest.fn(), digestPlayback: jest.fn() };
  const service = new TorrentPlaybackService(
    repository as unknown as TorrentSessionRepository,
    input as unknown as TorrentInputService,
    gateway as unknown as TorrentStreamGateway,
  );
  const settleWorker = () => new Promise<void>((resolve) => setImmediate(resolve));

  beforeEach(() => {
    jest.resetAllMocks();
    repository.findVisible.mockResolvedValue(session);
    repository.getProbe.mockResolvedValue(probe);
    repository.findReplay.mockResolvedValue(undefined);
    repository.beginPlayback.mockResolvedValue({
      session: { ...session, state: 'preparing', version: 5 },
      replay: false,
    });
    repository.findFile.mockResolvedValue({ engineFileIndex: 2, sizeBytes: 100 });
    repository.findEngineKey.mockResolvedValue('c'.repeat(40));
    repository.transition.mockImplementation((_id: string, version: number, state: string) =>
      Promise.resolve({ ...session, version: version + 1, state }),
    );
    gateway.hasCapacity.mockReturnValue(true);
    gateway.start.mockResolvedValue(undefined);
    gateway.waitReady.mockResolvedValue({
      absoluteAnchorSeconds: 10,
      mediaAnchorSeconds: 0.08,
      windowEndSeconds: 130,
    });
    gateway.stop.mockResolvedValue(undefined);
    gateway.waitComplete.mockResolvedValue(undefined);
    input.digestPlayback.mockReturnValue('digest');
    input.view.mockImplementation((value: unknown) => value);
  });

  it.each([
    null,
    { ...request, startPositionSeconds: -1 },
    { ...request, startPositionSeconds: Infinity },
    { ...request, expectedVersion: 0 },
    { ...request, expectedVersion: 1.5 },
    { ...request, audioTrackRef: 1 },
    { ...request, outputProfile: 'hevc-4k' },
    { ...request, outputProfile: null },
    { ...request, outputProfile: { width: 3840 } },
    { ...request, capabilities: { originalVideo: true, audio: 'truehd' } },
    { ...request, capabilities: { originalVideo: true, audio: 'aac-8', cpu: 10 } },
    { ...request, engineUrl: 'http://internal' },
  ])('rejects invalid playback input before repository or worker admission: %j', async (body) => {
    await expect(service.playback('owner', id, body, key)).rejects.toMatchObject({ status: 400 });
    expect(repository.findVisible).not.toHaveBeenCalled();
    expect(gateway.start).not.toHaveBeenCalled();
  });

  it('rejects a missing idempotency key before repository access', async () => {
    await expect(service.playback('owner', id, request, '')).rejects.toMatchObject({ status: 400 });
    expect(repository.findVisible).not.toHaveBeenCalled();
  });

  it('requires reopening old probes before applying the new colour/output contract', async () => {
    repository.getProbe.mockResolvedValue({ ...probe, video: undefined });
    await expect(service.playback('owner', id, request, key)).rejects.toMatchObject({
      status: 415,
    });
    expect(gateway.hasCapacity).not.toHaveBeenCalled();
    expect(repository.beginPlayback).not.toHaveBeenCalled();
  });

  it('hides foreign sessions and unknown audio tracks before replay or capacity admission', async () => {
    repository.findVisible.mockResolvedValueOnce(undefined);
    await expect(service.playback('other', id, request, key)).rejects.toMatchObject({
      status: 404,
    });
    expect(repository.getProbe).not.toHaveBeenCalled();
    await expect(
      service.playback('owner', id, { ...request, audioTrackRef: 'foreign-track' }, key),
    ).rejects.toMatchObject({ status: 404 });
    expect(repository.findReplay).not.toHaveBeenCalled();
    expect(gateway.hasCapacity).not.toHaveBeenCalled();
  });

  it('replays an accepted command without capacity admission or another worker', async () => {
    repository.findReplay.mockResolvedValue({ ...session, state: 'ready' });
    gateway.hasCapacity.mockReturnValue(false);
    await expect(service.playback('owner', id, request, key)).resolves.toMatchObject({
      state: 'ready',
    });
    expect(repository.findReplay).toHaveBeenCalledWith('owner', 'playback', key, 'digest');
    expect(gateway.hasCapacity).not.toHaveBeenCalled();
    expect(repository.beginPlayback).not.toHaveBeenCalled();
    expect(gateway.start).not.toHaveBeenCalled();
  });

  it('includes the negotiated profile in idempotency and reserves 1080p as a copy worker', async () => {
    repository.getProbe.mockResolvedValue({
      ...probe,
      copyVideo: false,
      video: {
        codec: 'h264',
        profile: 'High',
        pixelFormat: 'yuv420p',
        bitDepth: 8,
        width: 1920,
        height: 1080,
        fps: 24,
        level: 41,
        bitrate: 6_000_000,
      },
    });
    repository.beginPlayback.mockResolvedValue({ session, replay: true });
    await service.playback('owner', id, { ...request, outputProfile: 'h264-1080p' }, key);
    expect(input.digestPlayback).toHaveBeenCalledWith(id, 12, trackRef, 'h264-1080p', undefined);
    expect(gateway.hasCapacity).toHaveBeenCalledWith(false, undefined);
    expect(repository.beginPlayback).toHaveBeenCalledWith(
      'owner',
      id,
      4,
      trackRef,
      12,
      key,
      'digest',
      'h264-1080p',
      undefined,
    );
    await service.playback('owner', id, request, 'playback-command-2');
    expect(gateway.hasCapacity).toHaveBeenLastCalledWith(true, undefined);
  });

  it('requires confirmed original 4K before capacity admission and includes audio negotiation in the command', async () => {
    repository.getProbe.mockResolvedValue({
      ...probe,
      video: {
        ...probe.video,
        width: 3840,
        height: 2160,
        level: 51,
        contentType: 'video/mp4; codecs="avc1.640033"',
      },
    });
    await expect(service.playback('owner', id, request, key)).rejects.toMatchObject({
      status: 415,
      response: { code: 'TORRENT_CLIENT_UNSUPPORTED' },
    });
    expect(gateway.hasCapacity).not.toHaveBeenCalled();
    expect(repository.beginPlayback).not.toHaveBeenCalled();
    const capabilities = { originalVideo: true, audio: 'aac-6' };
    repository.beginPlayback.mockResolvedValue({ session, replay: true });
    await service.playback('owner', id, { ...request, capabilities }, key);
    expect(gateway.hasCapacity).toHaveBeenCalledWith(false, undefined);
    expect(input.digestPlayback).toHaveBeenCalledWith(id, 12, trackRef, 'h264-720p', capabilities);
    expect(repository.beginPlayback).toHaveBeenCalledWith(
      'owner',
      id,
      4,
      trackRef,
      12,
      key,
      'digest',
      'h264-720p',
      capabilities,
    );
  });

  it('publishes ready only after the selected file and generation have a first segment', async () => {
    let ready!: (value: typeof timeline) => void;
    gateway.waitReady.mockReturnValue(
      new Promise<typeof timeline>((resolve) => {
        ready = resolve;
      }),
    );
    await expect(service.playback('owner', id, request, key)).resolves.toMatchObject({
      state: 'preparing',
    });
    await settleWorker();
    expect(gateway.start).toHaveBeenCalledWith(
      id,
      2,
      { key: 'c'.repeat(40), file: 2, size: 100 },
      probe,
      audio,
      12,
    );
    expect(repository.transition).not.toHaveBeenCalled();
    ready(timeline);
    await settleWorker();
    expect(repository.transition).toHaveBeenCalledWith(id, 5, 'ready', {
      playbackTimeline: timeline,
    });
  });

  it.each([
    [new TorrentGatewayCapacity(), 'TORRENT_CAPACITY_EXCEEDED'],
    [new TorrentGatewayTimeout(), 'TORRENT_PLAYBACK_TIMEOUT'],
    [new Error('private engine path'), 'TORRENT_TRANSCODE_FAILED'],
  ])('stops a failed generation and permits explicit retry (%s)', async (error, failureCode) => {
    gateway.waitReady.mockRejectedValueOnce(error);
    await service.playback('owner', id, request, key);
    await settleWorker();
    expect(gateway.stop).toHaveBeenCalledWith(id, 2);
    expect(repository.transition).toHaveBeenCalledWith(id, 5, 'awaiting_playback', { failureCode });
    await service.playback('owner', id, request, 'playback-command-2');
    await settleWorker();
    expect(gateway.start).toHaveBeenCalledTimes(2);
    expect(repository.transition).toHaveBeenLastCalledWith(id, 5, 'ready', {
      playbackTimeline: timeline,
    });
  });

  it('does not start a second worker when a concurrent reservation wins replay', async () => {
    repository.beginPlayback.mockResolvedValue({
      session: { ...session, state: 'preparing' },
      replay: true,
    });
    await service.playback('owner', id, request, key);
    await settleWorker();
    expect(gateway.start).not.toHaveBeenCalled();
  });

  it('publishes the measured prefix before completion and revokes ready on a later worker failure', async () => {
    let fail!: (error: Error) => void;
    gateway.waitComplete.mockReturnValue(
      new Promise<void>((_resolve, reject) => {
        fail = reject;
      }),
    );
    await service.playback('owner', id, request, key);
    await settleWorker();
    expect(repository.transition).toHaveBeenCalledWith(id, 5, 'ready', {
      playbackTimeline: timeline,
    });
    expect(gateway.stop).not.toHaveBeenCalled();
    fail(new Error('Input ended before the bounded window completed'));
    await settleWorker();
    expect(gateway.stop).toHaveBeenCalledWith(id, 2);
    expect(repository.transition).toHaveBeenLastCalledWith(id, 6, 'awaiting_playback', {
      failureCode: 'TORRENT_TRANSCODE_FAILED',
    });
  });

  it('denies capacity before changing the session and allows replacing its own ready worker', async () => {
    gateway.hasCapacity.mockReturnValueOnce(false);
    await expect(service.playback('owner', id, request, key)).rejects.toMatchObject({
      status: 503,
    });
    expect(repository.beginPlayback).not.toHaveBeenCalled();
    repository.findVisible.mockResolvedValue({ ...session, state: 'ready' });
    repository.beginPlayback.mockResolvedValue({ session, replay: true });
    await service.playback('owner', id, request, key);
    expect(gateway.hasCapacity).toHaveBeenLastCalledWith(false, id);
  });

  it('maps stale file selection to a version conflict without touching workers', async () => {
    repository.selectFile.mockRejectedValueOnce(
      new TorrentSessionConflict('TORRENT_SESSION_CHANGED', 8),
    );
    await expect(
      service.selectFile('owner', id, { fileRef, expectedVersion: 4 }),
    ).rejects.toMatchObject({
      status: 409,
      response: { code: 'TORRENT_SESSION_CHANGED', details: { version: 8 } },
    });
    expect(gateway.stop).not.toHaveBeenCalled();
    repository.selectFile.mockRejectedValueOnce(new TorrentSessionNotFound());
    await expect(
      service.selectFile('other', id, { fileRef, expectedVersion: 4 }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
