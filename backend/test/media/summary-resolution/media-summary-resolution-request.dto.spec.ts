import { BadRequestException, ValidationPipe } from '@nestjs/common';
import {
  MEDIA_SUMMARY_RESOLUTION_LIMIT,
  MediaSummaryResolutionRequestDto,
} from '../../../src/media/summary-resolution/dto/media-summary-resolution-request.dto';

describe('MediaSummaryResolutionRequestDto', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });

  function transform(body: Record<string, unknown>) {
    return pipe.transform(body, {
      type: 'body',
      metatype: MediaSummaryResolutionRequestDto,
    });
  }

  it('accepts supported unique media references and removes unknown fields', async () => {
    const mediaRefs = [
      'imdb:tt1160419',
      'kinopoisk:409424',
      'shikimori:5114',
      'anilist:154587',
      'myanimelist:52991',
    ];

    await expect(transform({ mediaRefs, internal: 'remove-me' })).resolves.toEqual({
      mediaRefs,
    });
  });

  it.each([
    {},
    { mediaRefs: [] },
    { mediaRefs: 'imdb:tt1160419' },
    { mediaRefs: ['demo:movie:dune'] },
    { mediaRefs: ['imdb:tt1160419', 42] },
    { mediaRefs: ['imdb:tt1160419', 'imdb:tt1160419'] },
  ])('rejects an invalid request body %#', async (body) => {
    await expect(transform(body)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a batch larger than the configured limit', async () => {
    const mediaRefs = Array.from(
      { length: MEDIA_SUMMARY_RESOLUTION_LIMIT + 1 },
      (_, index) => `kinopoisk:${index + 1}`,
    );

    await expect(transform({ mediaRefs })).rejects.toBeInstanceOf(BadRequestException);
  });
});
