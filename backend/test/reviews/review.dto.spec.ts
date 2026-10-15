import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateReviewDto, UpdateReviewDto } from '../../src/reviews/dto/review.dto';

describe('review DTOs', () => {
  it('normalizes title whitespace and body line endings before validation', async () => {
    const dto = plainToInstance(CreateReviewDto, {
      title: '  Большое\tпродолжение  ',
      body: '  Первая строка рецензии.\r\nВторая строка.  ',
      isSpoiler: false,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toMatchObject({
      title: 'Большое продолжение',
      body: 'Первая строка рецензии.\nВторая строка.',
      isSpoiler: false,
    });
  });

  it.each([
    { title: '', body: 'Достаточно длинный текст рецензии.', isSpoiler: false },
    { title: 'Заголовок', body: 'Слишком коротко', isSpoiler: false },
    { title: 'Заголовок', body: 'Достаточно длинный текст рецензии.', isSpoiler: 'false' },
  ])('rejects invalid create payload %#', async (input) => {
    await expect(validate(plainToInstance(CreateReviewDto, input))).resolves.not.toHaveLength(0);
  });

  it('requires an exact edit version and validates optional fields', async () => {
    await expect(
      validate(
        plainToInstance(UpdateReviewDto, {
          title: ' Новый заголовок ',
          expectedUpdatedAt: '2026-10-12T10:00:00.000Z',
        }),
      ),
    ).resolves.toHaveLength(0);

    await expect(
      validate(plainToInstance(UpdateReviewDto, { title: 'Новый заголовок' })),
    ).resolves.not.toHaveLength(0);
    await expect(
      validate(
        plainToInstance(UpdateReviewDto, {
          title: 'Новый заголовок',
          expectedUpdatedAt: '2026-10-12T10:00:00+03:00',
        }),
      ),
    ).resolves.not.toHaveLength(0);
  });
});
