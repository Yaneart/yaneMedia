import type { AuthUserDto } from '../../src/auth/dto/auth-user.dto';
import { ContinueWatchingController } from '../../src/continue-watching/continue-watching.controller';
import type { ContinueWatchingService } from '../../src/continue-watching/continue-watching.service';

describe('ContinueWatchingController', () => {
  const user: AuthUserDto = {
    id: '93ea2794-e805-4f60-b14f-2005d2c61804',
    displayName: 'Artem',
    email: 'artem@example.com',
    createdAt: '2026-09-05T10:00:00.000Z',
  };
  const entries = [
    {
      mediaRef: 'imdb:tt15239678',
      sourceRef: 'stream:test:movie',
      episode: null,
      positionSeconds: 120,
      durationSeconds: 7200,
      updatedAt: '2026-09-13T10:30:00.000Z',
    },
  ];

  it('lists the current user progress', async () => {
    const listEntries = jest.fn().mockResolvedValue(entries);
    const controller = new ContinueWatchingController({
      listEntries,
    } as unknown as ContinueWatchingService);

    await expect(controller.list(user)).resolves.toEqual({ entries });
    expect(listEntries).toHaveBeenCalledWith(user.id);
  });

  it('saves one validated progress snapshot for the current user', async () => {
    const saveEntry = jest.fn().mockResolvedValue(entries);
    const controller = new ContinueWatchingController({
      saveEntry,
    } as unknown as ContinueWatchingService);
    const { mediaRef } = entries[0];
    const dto = {
      sourceRef: entries[0].sourceRef,
      episode: entries[0].episode,
      positionSeconds: entries[0].positionSeconds,
      durationSeconds: entries[0].durationSeconds,
    };

    await expect(controller.save(user, { mediaRef }, dto)).resolves.toEqual({ entries });
    expect(saveEntry).toHaveBeenCalledWith(user.id, mediaRef, dto);
  });

  it('removes one progress entry for the current user', async () => {
    const removeEntry = jest.fn().mockResolvedValue([]);
    const controller = new ContinueWatchingController({
      removeEntry,
    } as unknown as ContinueWatchingService);

    await expect(controller.remove(user, { mediaRef: entries[0].mediaRef })).resolves.toEqual({
      entries: [],
    });
    expect(removeEntry).toHaveBeenCalledWith(user.id, entries[0].mediaRef);
  });
});
