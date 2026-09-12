import type { FavoritesRepository } from '../../src/favorites/favorites.repository';
import { FavoritesService } from '../../src/favorites/favorites.service';

describe('FavoritesService', () => {
  const mediaRefs = ['imdb:tt15239678', 'anilist:154587'];
  const userId = '93ea2794-e805-4f60-b14f-2005d2c61804';

  function createService() {
    const findMediaRefsByUserId = jest.fn().mockResolvedValue(mediaRefs);
    const addMediaRefs = jest.fn().mockResolvedValue(undefined);
    const removeMediaRef = jest.fn().mockResolvedValue(undefined);
    const service = new FavoritesService({
      findMediaRefsByUserId,
      addMediaRefs,
      removeMediaRef,
    } as unknown as FavoritesRepository);

    return { service, findMediaRefsByUserId, addMediaRefs, removeMediaRef };
  }

  it('delegates a user-scoped list to the repository', async () => {
    const { service, findMediaRefsByUserId } = createService();

    await expect(service.listMediaRefs(userId)).resolves.toBe(mediaRefs);
    expect(findMediaRefsByUserId).toHaveBeenCalledWith(userId);
  });

  it('adds a batch and returns the resulting user list', async () => {
    const { service, addMediaRefs, findMediaRefsByUserId } = createService();

    await expect(service.addMediaRefs(userId, mediaRefs)).resolves.toBe(mediaRefs);
    expect(addMediaRefs).toHaveBeenCalledWith(userId, mediaRefs);
    expect(findMediaRefsByUserId).toHaveBeenCalledWith(userId);
  });

  it('removes one item and returns the resulting user list', async () => {
    const { service, removeMediaRef, findMediaRefsByUserId } = createService();

    await expect(service.removeMediaRef(userId, mediaRefs[0])).resolves.toBe(mediaRefs);
    expect(removeMediaRef).toHaveBeenCalledWith(userId, mediaRefs[0]);
    expect(findMediaRefsByUserId).toHaveBeenCalledWith(userId);
  });
});
