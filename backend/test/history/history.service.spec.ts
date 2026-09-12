import type { HistoryRepository } from '../../src/history/history.repository';
import { HistoryService } from '../../src/history/history.service';

describe('HistoryService', () => {
  const storedEntries = [
    { mediaRef: 'imdb:tt15239678', openedAt: new Date('2026-09-12T10:30:00.000Z') },
    { mediaRef: 'anilist:154587', openedAt: new Date('2026-09-11T18:00:00.000Z') },
  ];
  const userId = '93ea2794-e805-4f60-b14f-2005d2c61804';

  function createService() {
    const findByUserId = jest.fn().mockResolvedValue(storedEntries);
    const upsert = jest.fn().mockResolvedValue(undefined);
    const service = new HistoryService({ findByUserId, upsert } as unknown as HistoryRepository);

    return { service, findByUserId, upsert };
  }

  it('maps user-scoped history timestamps to the HTTP contract', async () => {
    const { service, findByUserId } = createService();

    await expect(service.listEntries(userId)).resolves.toEqual(
      storedEntries.map(({ mediaRef, openedAt }) => ({
        mediaRef,
        openedAt: openedAt.toISOString(),
      })),
    );
    expect(findByUserId).toHaveBeenCalledWith(userId);
  });

  it('upserts an opening and returns the resulting user history', async () => {
    const { service, findByUserId, upsert } = createService();
    const mediaRef = storedEntries[0].mediaRef;

    await expect(service.recordOpening(userId, mediaRef)).resolves.toEqual(
      storedEntries.map(({ mediaRef: storedMediaRef, openedAt }) => ({
        mediaRef: storedMediaRef,
        openedAt: openedAt.toISOString(),
      })),
    );
    expect(upsert).toHaveBeenCalledWith(userId, mediaRef);
    expect(findByUserId).toHaveBeenCalledWith(userId);
    expect(upsert.mock.invocationCallOrder[0]).toBeLessThan(
      findByUserId.mock.invocationCallOrder[0],
    );
  });
});
