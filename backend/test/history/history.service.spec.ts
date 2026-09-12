import type { HistoryRepository } from '../../src/history/history.repository';
import { HistoryService } from '../../src/history/history.service';

describe('HistoryService', () => {
  it('maps user-scoped history timestamps to the HTTP contract', async () => {
    const storedEntries = [
      { mediaRef: 'imdb:tt15239678', openedAt: new Date('2026-09-12T10:30:00.000Z') },
      { mediaRef: 'anilist:154587', openedAt: new Date('2026-09-11T18:00:00.000Z') },
    ];
    const findByUserId = jest.fn().mockResolvedValue(storedEntries);
    const service = new HistoryService({ findByUserId } as unknown as HistoryRepository);
    const userId = '93ea2794-e805-4f60-b14f-2005d2c61804';

    await expect(service.listEntries(userId)).resolves.toEqual(
      storedEntries.map(({ mediaRef, openedAt }) => ({
        mediaRef,
        openedAt: openedAt.toISOString(),
      })),
    );
    expect(findByUserId).toHaveBeenCalledWith(userId);
  });
});
