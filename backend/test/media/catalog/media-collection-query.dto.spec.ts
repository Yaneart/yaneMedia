import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { MediaCollectionQueryDto } from '../../../src/media/catalog/dto/media-collection-query.dto';

describe('MediaCollectionQueryDto', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });

  function transform(query: Record<string, unknown>) {
    return pipe.transform(query, {
      type: 'query',
      metatype: MediaCollectionQueryDto,
    });
  }

  it('uses bounded defaults and removes unknown values', async () => {
    await expect(transform({ internal: 'remove-me' })).resolves.toEqual({
      offset: 0,
      limit: 24,
    });
  });

  it('converts valid pagination values to numbers', async () => {
    await expect(transform({ offset: '20', limit: '10' })).resolves.toEqual({
      offset: 20,
      limit: 10,
    });
  });

  it.each([20, 24])('accepts a collection page of %i items', async (limit) => {
    await expect(transform({ limit: String(limit) })).resolves.toEqual({ offset: 0, limit });
  });

  it.each([{ offset: '-1' }, { offset: '1.5' }, { limit: '0' }, { limit: '25' }, { limit: '1.5' }])(
    'rejects an invalid collection page %#',
    async (query) => {
      await expect(transform(query)).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});
