import type { AuthUserDto } from '../../src/auth/dto/auth-user.dto';
import { FavoritesController } from '../../src/favorites/favorites.controller';
import type { FavoritesService } from '../../src/favorites/favorites.service';

describe('FavoritesController', () => {
  it('returns the current user media refs', async () => {
    const mediaRefs = ['imdb:tt15239678', 'anilist:154587'];
    const listMediaRefs = jest.fn().mockResolvedValue(mediaRefs);
    const controller = new FavoritesController({ listMediaRefs } as unknown as FavoritesService);
    const user: AuthUserDto = {
      id: '93ea2794-e805-4f60-b14f-2005d2c61804',
      displayName: 'Артём',
      email: 'artem@example.com',
      createdAt: '2026-09-05T10:00:00.000Z',
    };

    await expect(controller.list(user)).resolves.toEqual({ mediaRefs });
    expect(listMediaRefs).toHaveBeenCalledWith(user.id);
  });
});
