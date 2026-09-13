import type { ContinueWatchingRepository } from '../../src/continue-watching/continue-watching.repository';
import { ContinueWatchingService } from '../../src/continue-watching/continue-watching.service';

describe('ContinueWatchingService', () => {
  const userId = '93ea2794-e805-4f60-b14f-2005d2c61804';
  const storedEntries = [
    {
      mediaRef: 'imdb:tt15239678',
      sourceRef: 'stream:test:movie',
      seasonNumber: null,
      episodeNumber: null,
      absoluteEpisodeNumber: null,
      positionSeconds: 120.5,
      durationSeconds: 7200,
      updatedAt: new Date('2026-09-13T10:30:00.000Z'),
    },
    {
      mediaRef: 'anilist:154587',
      sourceRef: 'stream:test:episode-3',
      seasonNumber: 2,
      episodeNumber: 3,
      absoluteEpisodeNumber: 13,
      positionSeconds: 300,
      durationSeconds: null,
      updatedAt: new Date('2026-09-12T18:00:00.000Z'),
    },
  ];

  function createService() {
    const findByUserId = jest.fn().mockResolvedValue(storedEntries);
    const upsertAndTrim = jest.fn().mockResolvedValue(undefined);
    const remove = jest.fn().mockResolvedValue(undefined);
    const service = new ContinueWatchingService({
      findByUserId,
      upsertAndTrim,
      remove,
    } as unknown as ContinueWatchingRepository);

    return { service, findByUserId, upsertAndTrim, remove };
  }

  it('maps nullable episode columns and server timestamps to the API contract', async () => {
    const { service } = createService();

    await expect(service.listEntries(userId)).resolves.toEqual([
      {
        mediaRef: 'imdb:tt15239678',
        sourceRef: 'stream:test:movie',
        episode: null,
        positionSeconds: 120.5,
        durationSeconds: 7200,
        updatedAt: '2026-09-13T10:30:00.000Z',
      },
      {
        mediaRef: 'anilist:154587',
        sourceRef: 'stream:test:episode-3',
        episode: { seasonNumber: 2, episodeNumber: 3, absoluteEpisodeNumber: 13 },
        positionSeconds: 300,
        durationSeconds: null,
        updatedAt: '2026-09-12T18:00:00.000Z',
      },
    ]);
  });

  it('clamps progress to duration and persists the complete playback selection', async () => {
    const { service, upsertAndTrim, remove } = createService();
    const dto = {
      sourceRef: 'stream:test:episode-3',
      episode: { seasonNumber: 2, episodeNumber: 3, absoluteEpisodeNumber: 13 },
      positionSeconds: 400,
      durationSeconds: 500,
    };

    await service.saveEntry(userId, 'anilist:154587', dto);

    expect(upsertAndTrim).toHaveBeenCalledWith({
      userId,
      mediaRef: 'anilist:154587',
      sourceRef: dto.sourceRef,
      seasonNumber: 2,
      episodeNumber: 3,
      absoluteEpisodeNumber: 13,
      positionSeconds: 400,
      durationSeconds: 500,
    });
    expect(remove).not.toHaveBeenCalled();
  });

  it('removes completed progress instead of retaining a finished card', async () => {
    const { service, upsertAndTrim, remove } = createService();

    await service.saveEntry(userId, 'imdb:tt15239678', {
      sourceRef: 'stream:test:movie',
      episode: null,
      positionSeconds: 7201,
      durationSeconds: 7200,
    });

    expect(remove).toHaveBeenCalledWith(userId, 'imdb:tt15239678');
    expect(upsertAndTrim).not.toHaveBeenCalled();
  });

  it('removes one user entry before returning the refreshed list', async () => {
    const { service, findByUserId, remove } = createService();

    await expect(service.removeEntry(userId, 'imdb:tt15239678')).resolves.toHaveLength(2);
    expect(remove).toHaveBeenCalledWith(userId, 'imdb:tt15239678');
    expect(remove.mock.invocationCallOrder[0]).toBeLessThan(
      findByUserId.mock.invocationCallOrder[0],
    );
  });
});
