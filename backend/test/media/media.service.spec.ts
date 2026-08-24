import type { MediaEngine } from '@media-engine/core';
import { MediaService } from '../../src/media/media.service';

describe('MediaService', () => {
  it('uses an anime-native reference for anime search results', async () => {
    const mediaEngine = {
      search: jest.fn().mockResolvedValue({
        results: [
          {
            item: {
              id: 'anime-result',
              type: 'anime',
              title: 'Fullmetal Alchemist: Brotherhood',
              ids: {
                imdb: 'tt1355642',
                shikimori: '5114',
                aniList: '5114',
                myAnimeList: '5114',
              },
            },
          },
        ],
      }),
    } as unknown as MediaEngine;
    const service = new MediaService(mediaEngine);

    await expect(service.searchByTitle('Fullmetal Alchemist')).resolves.toEqual([
      expect.objectContaining({ mediaRef: 'shikimori:5114', type: 'anime' }),
    ]);
  });
});
