import type { FavoritesRepository } from '../../src/favorites/favorites.repository';
import { FavoritesService } from '../../src/favorites/favorites.service';

describe('FavoritesService', () => {
  it('delegates a user-scoped list to the repository', async () => {
    const mediaRefs = ['imdb:tt15239678', 'anilist:154587'];
    const findMediaRefsByUserId = jest.fn().mockResolvedValue(mediaRefs);
    const service = new FavoritesService({
      findMediaRefsByUserId,
    } as unknown as FavoritesRepository);
    const userId = '93ea2794-e805-4f60-b14f-2005d2c61804';

    await expect(service.listMediaRefs(userId)).resolves.toBe(mediaRefs);
    expect(findMediaRefsByUserId).toHaveBeenCalledWith(userId);
  });
});
