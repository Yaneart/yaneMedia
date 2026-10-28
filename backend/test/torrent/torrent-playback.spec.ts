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
  const probe = { copyVideo: true, audioTracks: [audio] };
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
    repository.transition.mockResolvedValue(undefined);
    gateway.hasCapacity.mockReturnValue(true);
    gateway.start.mockResolvedValue(undefined);
    gateway.waitReady.mockResolvedValue({
      absoluteAnchorSeconds: 10,
      mediaAnchorSeconds: 0.08,
      windowEndSeconds: 130,
    });
    gateway.stop.mockResolvedValue(undefined);
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
      playbackTimeline: expect.objectContaining({ absoluteAnchorSeconds: 10 }),
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
