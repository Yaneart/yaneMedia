import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { PublicProfileCollectionQueryDto } from '../../src/profile/dto/public-profile-collection-query.dto';

const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });

describe('PublicProfileCollectionQueryDto', () => {
  it('uses the default limit and transforms a valid custom limit', async () => {
    await expect(pipe.transform({}, metadata())).resolves.toMatchObject({ limit: 20 });
    await expect(pipe.transform({ limit: '50', cursor: 'opaque' }, metadata())).resolves.toEqual({
      limit: 50,
      cursor: 'opaque',
    });
  });

  it.each([{ limit: '0' }, { limit: '51' }, { limit: '1.5' }, { cursor: '' }])(
    'rejects invalid pagination query %p',
    async (value) => {
      await expect(pipe.transform(value, metadata())).rejects.toBeInstanceOf(BadRequestException);
    },
  );
});

function metadata() {
  return { type: 'query' as const, metatype: PublicProfileCollectionQueryDto, data: undefined };
}
