import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { MediaAvailabilityQueryDto } from '../../src/media/dto/media-availability-query.dto';

describe('MediaAvailabilityQueryDto', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });

  function transform(query: Record<string, unknown>) {
    return pipe.transform(query, {
      type: 'query',
      metatype: MediaAvailabilityQueryDto,
    });
  }

  it('converts episode query strings to numbers and removes unknown fields', async () => {
    await expect(
      transform({
        seasonNumber: '0',
        episodeNumber: '2',
        absoluteEpisodeNumber: '14',
        internal: 'remove-me',
      }),
    ).resolves.toEqual({
      seasonNumber: 0,
      episodeNumber: 2,
      absoluteEpisodeNumber: 14,
    });
  });

  it.each([
    { seasonNumber: '-1' },
    { episodeNumber: '1.5' },
    { absoluteEpisodeNumber: 'not-a-number' },
  ])('rejects invalid episode identity %#', async (query) => {
    await expect(transform(query)).rejects.toBeInstanceOf(BadRequestException);
  });
});
