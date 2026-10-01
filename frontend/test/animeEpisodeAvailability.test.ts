import type { MediaDetails } from '../src/entities/media';
import type { DirectEpisodeOption } from '../src/features/source-selection';
import {
  createAnimePlaybackEpisodes,
  getAvailabilityEpisode,
} from '../src/pages/media/model/animeEpisodeAvailability';

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
  const release = {
    number: 2,
    seasonEpisodeOffset: 13,
    absoluteEpisodeOffset: 38,
  };

  it('combines the season, local episode and absolute episode coordinates', () => {
    const [canonicalEpisode] = createAnimePlaybackEpisodes(media, [episode], release);

    expect(getAvailabilityEpisode(media, canonicalEpisode)).toEqual({
      seasonNumber: 2,
      episodeNumber: 15,
      absoluteEpisodeNumber: 40,
    });
  });

  it('fails closed when the anime season is unknown', () => {
    expect(getAvailabilityEpisode(media, episode)).toBeNull();
  });

  it('creates selectable episodes when the initial provider has no direct sources', () => {
    expect(createAnimePlaybackEpisodes(media, [], release)).toEqual([
      {
        key: 'season:2:episode:15',
        seasonNumber: 2,
        episodeNumber: 15,
        absoluteEpisodeNumber: 40,
        releaseEpisodeNumber: 2,
        sources: [],
      },
    ]);
  });

  it('keeps initial direct sources while filling gaps from anime metadata', () => {
    const sourcedEpisode = {
      ...episode,
      sources: [{ sourceRef: 'stream:test' }],
    } as DirectEpisodeOption;
    const anime = {
      type: 'anime',
      episodes: [
        { episodeNumber: 1, absoluteEpisodeNumber: 1 },
        { episodeNumber: 2, absoluteEpisodeNumber: 2 },
      ],
    } as MediaDetails;

    expect(createAnimePlaybackEpisodes(anime, [sourcedEpisode], release)).toEqual([
      {
        key: 'season:2:episode:14',
        seasonNumber: 2,
        episodeNumber: 14,
        absoluteEpisodeNumber: 39,
        releaseEpisodeNumber: 1,
        sources: [],
      },
      {
        ...sourcedEpisode,
        key: 'season:2:episode:15',
        seasonNumber: 2,
        episodeNumber: 15,
        absoluteEpisodeNumber: 40,
        releaseEpisodeNumber: 2,
      },
    ]);
  });
});
