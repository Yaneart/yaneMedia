import type { MediaDetails } from '../src/entities/media';
import type { DirectEpisodeOption } from '../src/features/source-selection';
import { getAvailabilityEpisode } from '../src/pages/media/model/animeEpisodeAvailability';

describe('episodic anime availability selection', () => {
  const media = {
    type: 'anime',
    episodes: [{ episodeNumber: 2, absoluteEpisodeNumber: 2 }],
  } as MediaDetails;
  const episode = {
    key: 'absolute:2',
    absoluteEpisodeNumber: 2,
    sources: [],
  } satisfies DirectEpisodeOption;

  it('combines the season, local episode and absolute episode coordinates', () => {
    expect(getAvailabilityEpisode(media, episode, 2, 28)).toEqual({
      seasonNumber: 2,
      episodeNumber: 2,
      absoluteEpisodeNumber: 30,
    });
  });

  it('fails closed when the anime season is unknown', () => {
    expect(getAvailabilityEpisode(media, episode)).toBeNull();
  });
});
