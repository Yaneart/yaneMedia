import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { RecordHistoryDto } from '../../src/history/dto/record-history.dto';

describe('RecordHistoryDto', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });

  function transform(body: Record<string, unknown>) {
    return pipe.transform(body, { type: 'body', metatype: RecordHistoryDto });
  }

  it('accepts a supported media ref and removes unknown fields', async () => {
    await expect(
      transform({ mediaRef: 'imdb:tt15239678', openedAt: '2099-01-01T00:00:00.000Z' }),
    ).resolves.toEqual({ mediaRef: 'imdb:tt15239678' });
  });

  it.each([
    {},
    { mediaRef: 42 },
    { mediaRef: 'demo:movie:dune' },
    { mediaRef: 'external:https://example.com' },
  ])('rejects an invalid media ref %#', async (body) => {
    await expect(transform(body)).rejects.toBeInstanceOf(BadRequestException);
  });
});
