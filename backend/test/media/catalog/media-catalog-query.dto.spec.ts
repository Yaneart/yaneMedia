import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { MediaCatalogQueryDto } from '../../../src/media/catalog/dto/media-catalog-query.dto';

describe('MediaCatalogQueryDto', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });

  function transform(query: Record<string, unknown>) {
    return pipe.transform(query, {
      type: 'query',
      metatype: MediaCatalogQueryDto,
    });
  }

  it.each(['movie', 'series', 'anime'])('accepts the %s catalog type', async (type) => {
    await expect(transform({ type, internal: 'remove-me' })).resolves.toEqual({ type });
  });

  it('transforms bounded collection pagination', async () => {
    await expect(transform({ type: 'movie', offset: '2', limit: '20' })).resolves.toEqual({
      type: 'movie',
      offset: 2,
      limit: 20,
    });
  });

  it.each([{}, { type: 'documentary' }, { type: 'Movie' }, { type: '' }])(
    'rejects an unsupported catalog query %#',
    async (query) => {
      await expect(transform(query)).rejects.toBeInstanceOf(BadRequestException);
    },
  );

  it.each([
    { type: 'movie', offset: '0' },
    { type: 'movie', limit: '2' },
    { type: 'movie', offset: '-1', limit: '2' },
    { type: 'movie', offset: '1.5', limit: '2' },
    { type: 'movie', offset: '0', limit: '0' },
    { type: 'movie', offset: '0', limit: '21' },
    { type: 'movie', offset: 'zero', limit: '2' },
  ])('rejects invalid pagination %#', async (query) => {
    await expect(transform(query)).rejects.toBeInstanceOf(BadRequestException);
  });
});
