import type { AuthUserDto } from '../../src/auth/dto/auth-user.dto';
import { HistoryController } from '../../src/history/history.controller';
import type { HistoryService } from '../../src/history/history.service';

describe('HistoryController', () => {
  const entries = [
    { mediaRef: 'imdb:tt15239678', openedAt: '2026-09-12T10:30:00.000Z' },
    { mediaRef: 'anilist:154587', openedAt: '2026-09-11T18:00:00.000Z' },
  ];
  const user: AuthUserDto = {
    id: '93ea2794-e805-4f60-b14f-2005d2c61804',
    displayName: 'Artem',
    email: 'artem@example.com',
    createdAt: '2026-09-05T10:00:00.000Z',
  };

  it('returns the current user history entries', async () => {
    const listEntries = jest.fn().mockResolvedValue(entries);
    const controller = new HistoryController({ listEntries } as unknown as HistoryService);

    await expect(controller.list(user)).resolves.toEqual({ entries });
    expect(listEntries).toHaveBeenCalledWith(user.id);
  });

  it('records an opening for the current user', async () => {
    const recordOpening = jest.fn().mockResolvedValue(entries);
    const controller = new HistoryController({ recordOpening } as unknown as HistoryService);

    await expect(controller.record(user, { mediaRef: entries[0].mediaRef })).resolves.toEqual({
      entries,
    });
    expect(recordOpening).toHaveBeenCalledWith(user.id, entries[0].mediaRef);
  });
});
