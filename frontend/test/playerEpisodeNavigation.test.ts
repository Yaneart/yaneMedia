import { createPlayerEpisodeNavigation } from '../src/pages/media/model/playerEpisodeNavigation';

describe('player episode labels', () => {
  it('omits duplicate catalog placeholders and retains real titles', () => {
    const navigation = createPlayerEpisodeNavigation(
      [
        { key: '1', episodeNumber: 1, title: ' 1 СЕРИЯ ', sources: [] },
        { key: '2', episodeNumber: 2, title: 'Пилот', sources: [] },
        { key: '3', episodeNumber: 3, sources: [] },
      ],
      undefined,
      true,
      async () => {},
    );
    expect(navigation.episodes?.map(({ label }) => label)).toEqual([
      '1 серия',
      '2 серия · Пилот',
      '3 серия',
    ]);
  });
});
