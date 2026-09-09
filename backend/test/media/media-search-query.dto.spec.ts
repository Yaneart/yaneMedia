import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { MediaSearchQueryDto } from '../../src/media/dto/media-search-query.dto';

describe('MediaSearchQueryDto', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });

  function transform(query: Record<string, unknown>) {
    return pipe.transform(query, {
      type: 'query',
      metatype: MediaSearchQueryDto,
    });
  }

  it.each(['movie', 'series', 'anime'])('accepts the %s search type', async (type) => {
    await expect(transform({ query: ' Dune ', type })).resolves.toEqual({
      query: 'Dune',
      type,
    });
  });

  it('keeps the search type optional for the general search page', async () => {
    await expect(transform({ query: 'Dune' })).resolves.toEqual({ query: 'Dune' });
  });

  it('accepts and transforms a title-independent filter query', async () => {
    await expect(
      transform({ type: 'movie', genre: ' Horror ', year: '2024', minimumRating: '7.5' }),
    ).resolves.toEqual({
      type: 'movie',
      genre: 'Horror',
      year: 2024,
      minimumRating: 7.5,
    });
  });

  it.each([
    { year: 'recent' },
    { year: '-1' },
    { minimumRating: 'high' },
    { minimumRating: '10.1' },
  ])('rejects invalid numeric filters: %j', async (query) => {
    await expect(transform(query)).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['documentary', 'Movie', ''])('rejects the unsupported %j search type', async (type) => {
    await expect(transform({ query: 'Dune', type })).rejects.toBeInstanceOf(BadRequestException);
  });
});
