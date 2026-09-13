import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { SaveContinueWatchingDto } from '../../src/continue-watching/dto/save-continue-watching.dto';

describe('SaveContinueWatchingDto', () => {
  const pipe = new ValidationPipe({ transform: true, whitelist: true });

  function transform(body: Record<string, unknown>) {
    return pipe.transform(body, { type: 'body', metatype: SaveContinueWatchingDto });
  }

  it('accepts movie progress and strips client-owned timestamps', async () => {
    await expect(
      transform({
        sourceRef: 'stream:test:movie',
        episode: null,
        positionSeconds: 120.5,
        durationSeconds: 7200,
        updatedAt: '2099-01-01T00:00:00.000Z',
      }),
    ).resolves.toEqual({
      sourceRef: 'stream:test:movie',
      episode: null,
      positionSeconds: 120.5,
      durationSeconds: 7200,
    });
  });

  it('accepts a validated episode selection and unknown duration', async () => {
    await expect(
      transform({
        sourceRef: 'stream:test:episode',
        episode: { seasonNumber: 2, episodeNumber: 3, absoluteEpisodeNumber: 13 },
        positionSeconds: 0,
        durationSeconds: null,
      }),
    ).resolves.toEqual({
      sourceRef: 'stream:test:episode',
      episode: { seasonNumber: 2, episodeNumber: 3, absoluteEpisodeNumber: 13 },
      positionSeconds: 0,
      durationSeconds: null,
    });
  });

  it.each([
    {},
    { sourceRef: '', episode: null, positionSeconds: 0, durationSeconds: null },
    { sourceRef: 'x'.repeat(513), episode: null, positionSeconds: 0, durationSeconds: null },
    { sourceRef: 'stream:test', positionSeconds: 0, durationSeconds: null },
    { sourceRef: 'stream:test', episode: {}, positionSeconds: 0, durationSeconds: null },
    { sourceRef: 'stream:test', episode: null, positionSeconds: -1, durationSeconds: null },
    { sourceRef: 'stream:test', episode: null, positionSeconds: 0 },
    { sourceRef: 'stream:test', episode: null, positionSeconds: 0, durationSeconds: -1 },
  ])('rejects malformed progress %#', async (body) => {
    await expect(transform(body)).rejects.toBeInstanceOf(BadRequestException);
  });
});
