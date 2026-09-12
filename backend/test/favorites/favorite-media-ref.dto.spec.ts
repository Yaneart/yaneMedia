import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  AddFavoritesDto,
  FAVORITES_BATCH_LIMIT,
  FavoriteMediaRefDto,
} from '../../src/favorites/dto/favorite-media-ref.dto';

describe('favorite media ref DTOs', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });

  function transformBody(body: Record<string, unknown>) {
    return pipe.transform(body, { type: 'body', metatype: AddFavoritesDto });
  }

  function transformParam(param: Record<string, unknown>) {
    return pipe.transform(param, { type: 'param', metatype: FavoriteMediaRefDto });
  }

  it('accepts supported unique refs and removes unknown batch fields', async () => {
    const mediaRefs = [
      'imdb:tt1160419',
      'kinopoisk:409424',
      'shikimori:5114',
      'anilist:154587',
      'myanimelist:52991',
    ];

    await expect(transformBody({ mediaRefs, internal: true })).resolves.toEqual({ mediaRefs });
    await expect(transformParam({ mediaRef: mediaRefs[0], internal: true })).resolves.toEqual({
      mediaRef: mediaRefs[0],
    });
  });

  it.each([
    {},
    { mediaRefs: [] },
    { mediaRefs: 'imdb:tt1160419' },
    { mediaRefs: ['demo:movie:dune'] },
    { mediaRefs: ['imdb:tt1160419', 42] },
    { mediaRefs: ['imdb:tt1160419', 'imdb:tt1160419'] },
  ])('rejects an invalid batch %#', async (body) => {
    await expect(transformBody(body)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an oversized batch and malformed route param', async () => {
    const mediaRefs = Array.from(
      { length: FAVORITES_BATCH_LIMIT + 1 },
      (_, index) => `kinopoisk:${index + 1}`,
    );

    await expect(transformBody({ mediaRefs })).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      transformParam({ mediaRef: 'external:https://example.com' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
