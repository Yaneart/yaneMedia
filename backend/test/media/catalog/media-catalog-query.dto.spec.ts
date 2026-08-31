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

  it.each([{}, { type: 'documentary' }, { type: 'Movie' }, { type: '' }])(
    'rejects an unsupported catalog query %#',
    async (query) => {
      await expect(transform(query)).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});
