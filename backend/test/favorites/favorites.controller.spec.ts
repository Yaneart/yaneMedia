import type { AuthUserDto } from '../../src/auth/dto/auth-user.dto';
import { FavoritesController } from '../../src/favorites/favorites.controller';
import type { FavoritesService } from '../../src/favorites/favorites.service';

describe('FavoritesController', () => {
  const mediaRefs = ['imdb:tt15239678', 'anilist:154587'];
  const user: AuthUserDto = {
    id: '93ea2794-e805-4f60-b14f-2005d2c61804',
    displayName: 'Артём',
    email: 'artem@example.com',
    createdAt: '2026-09-05T10:00:00.000Z',
  };

  function createController() {
    const listMediaRefs = jest.fn().mockResolvedValue(mediaRefs);
    const addMediaRefs = jest.fn().mockResolvedValue(mediaRefs);
    const removeMediaRef = jest.fn().mockResolvedValue(mediaRefs);
    const controller = new FavoritesController({
      listMediaRefs,
      addMediaRefs,
      removeMediaRef,
    } as unknown as FavoritesService);

    return { controller, listMediaRefs, addMediaRefs, removeMediaRef };
  }

  it('returns the current user media refs', async () => {
    const { controller, listMediaRefs } = createController();

    await expect(controller.list(user)).resolves.toEqual({ mediaRefs });
    expect(listMediaRefs).toHaveBeenCalledWith(user.id);
  });

  it('adds the requested batch for the current user', async () => {
    const { controller, addMediaRefs } = createController();

    await expect(controller.add(user, { mediaRefs })).resolves.toEqual({ mediaRefs });
    expect(addMediaRefs).toHaveBeenCalledWith(user.id, mediaRefs);
  });

  it('removes the requested item for the current user', async () => {
    const { controller, removeMediaRef } = createController();

    await expect(controller.remove(user, { mediaRef: mediaRefs[0] })).resolves.toEqual({
      mediaRefs,
    });
    expect(removeMediaRef).toHaveBeenCalledWith(user.id, mediaRefs[0]);
  });
});
