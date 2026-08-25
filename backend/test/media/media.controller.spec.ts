import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { MediaAvailabilityDto } from '../../src/media/dto/media-availability.dto';
import { MediaController } from '../../src/media/media.controller';
import type { MediaService } from '../../src/media/media.service';

describe('MediaController availability', () => {
  const availability: MediaAvailabilityDto = {
    sources: [],
    episodes: [],
    checkedAt: '2026-08-25T12:00:00.000Z',
    degraded: false,
    hasExpiredSources: false,
  };

  function createController() {
    const getAvailabilityByRef = jest.fn() as jest.MockedFunction<
      MediaService['getAvailabilityByRef']
    >;
    const mediaService = { getAvailabilityByRef } as unknown as MediaService;

    return {
      controller: new MediaController(mediaService),
      getAvailabilityByRef,
    };
  }

  it('returns normalized availability and forwards the playback User-Agent', async () => {
    const { controller, getAvailabilityByRef } = createController();
    getAvailabilityByRef.mockResolvedValue(availability);
    const query = {
      seasonNumber: 1,
      episodeNumber: 2,
      absoluteEpisodeNumber: 14,
    };

    await expect(
      controller.getAvailability('imdb:tt0816692', query, 'Playback Browser'),
    ).resolves.toBe(availability);
    expect(getAvailabilityByRef).toHaveBeenCalledWith('imdb:tt0816692', 'Playback Browser', query);
  });

  it('returns 404 when media details are missing', async () => {
    const { controller, getAvailabilityByRef } = createController();
    getAvailabilityByRef.mockResolvedValue(null);

    await expect(controller.getAvailability('imdb:tt0000000', {})).rejects.toThrow(
      new NotFoundException('Media not found'),
    );
  });

  it('returns 400 when a season is supplied without an episode', async () => {
    const { controller, getAvailabilityByRef } = createController();

    await expect(controller.getAvailability('imdb:tt0903747', { seasonNumber: 1 })).rejects.toThrow(
      new BadRequestException('episodeNumber is required when seasonNumber is provided'),
    );
    expect(getAvailabilityByRef).not.toHaveBeenCalled();
  });
});
