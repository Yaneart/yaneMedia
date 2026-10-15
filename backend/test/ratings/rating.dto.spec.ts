import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { RatingMediaRefDto, UpsertRatingDto } from '../../src/ratings/dto/rating.dto';

describe('rating DTOs', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });

  it.each([1, 5, 10])('accepts integer rating %s', async (value) => {
    await expect(
      pipe.transform({ value }, { type: 'body', metatype: UpsertRatingDto }),
    ).resolves.toEqual({ value });
  });

  it.each([0, 11, 1.5, 'nine', null])('rejects invalid rating %#', async (value) => {
    await expect(
      pipe.transform({ value }, { type: 'body', metatype: UpsertRatingDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts canonical and external locators but rejects malformed refs', async () => {
    for (const mediaRef of ['work_00000000-0000-4000-8000-000000000001', 'imdb:tt15239678']) {
      await expect(
        pipe.transform({ mediaRef }, { type: 'param', metatype: RatingMediaRefDto }),
      ).resolves.toEqual({ mediaRef });
    }
    await expect(
      pipe.transform({ mediaRef: 'unknown:1' }, { type: 'param', metatype: RatingMediaRefDto }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
