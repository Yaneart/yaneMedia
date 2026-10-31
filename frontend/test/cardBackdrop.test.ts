import { describe, expect, test } from 'bun:test';
import { getCardBackdrop } from '../src/entities/media/model/cardBackdrop';

describe('card backdrops', () => {
  test('uses the fixed card variant for local stored backdrops without mutating the summary', () => {
    for (const extension of ['webp', 'jpg', 'png']) {
      for (const origin of ['', 'http://localhost:3000']) {
        const artwork = {
          url: `${origin}/api/v1/media/assets/backdrop/${'a'.repeat(64)}.${extension}`,
          width: 3840,
          height: 2160,
        };
        expect(getCardBackdrop(artwork)).toEqual({ ...artwork, url: `${artwork.url}/card` });
        expect(artwork.url.endsWith('/card')).toBe(false);
      }
    }
  });

  test('leaves missing, external and non-backdrop artwork unchanged', () => {
    expect(getCardBackdrop(undefined)).toBeUndefined();
    for (const url of [
      'https://images.example/backdrop.webp',
      `/api/v1/media/assets/poster/${'a'.repeat(64)}.webp`,
      `/api/v1/media/assets/backdrop/${'a'.repeat(64)}.webp/card`,
    ]) {
      const artwork = { url };
      expect(getCardBackdrop(artwork)).toBe(artwork);
    }
  });
});
