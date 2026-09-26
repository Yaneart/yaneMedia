import { createHash } from 'node:crypto';
import {
  anibridgeProvenance,
  resolveAnimeIdentityMappings,
} from '../../../src/media/catalog/anime-identity-mapping';

describe('anime identity mapping', () => {
  it('resolves the pinned AniBridge mapping for Spirited Away', () => {
    expect(resolveAnimeIdentityMappings(['anilist:199', 'myanimelist:199'])).toEqual({
      identities: [{ mediaRef: 'imdb:tt0245429', provenance: anibridgeProvenance }],
      rejectedProviders: [],
    });
  });

  it('rejects ambiguous provider matches instead of choosing one', () => {
    const snapshot = {
      schemaVersion: 1,
      source: {
        repository: 'anibridge/anibridge-mappings',
        release: 'v3',
        asset: 'mappings.min.json',
        assetUpdatedAt: '2026-09-25T06:58:34Z',
        assetSha256: 'e224de82869f785889a677a1674c6ad5ffc0e4b06cea39ef8156f4b06f8846ee',
      },
      mappings: [{ mediaRef: 'anilist:199', imdbIds: ['tt0245429', 'tt9999999'] }],
    };
    const digest = createHash('sha256').update(JSON.stringify(snapshot.mappings)).digest('hex');

    expect(resolveAnimeIdentityMappings(['anilist:199'], undefined, snapshot, digest)).toEqual({
      identities: [],
      rejectedProviders: ['imdb'],
    });
  });

  it('lets a provenance-bearing editorial override replace a disputed provider', () => {
    expect(
      resolveAnimeIdentityMappings(['anilist:199'], {
        mediaRefs: ['imdb:tt9999999', 'kinopoisk:370'],
        provenance: 'editorial-verified:manual-review',
      }),
    ).toEqual({
      identities: [
        { mediaRef: 'imdb:tt9999999', provenance: 'editorial-verified:manual-review' },
        { mediaRef: 'kinopoisk:370', provenance: 'editorial-verified:manual-review' },
      ],
      rejectedProviders: [],
    });
  });

  it('fails closed when the pinned mapping payload checksum changes', () => {
    expect(() =>
      resolveAnimeIdentityMappings(['anilist:199'], undefined, {
        schemaVersion: 1,
        source: {
          repository: 'anibridge/anibridge-mappings',
          release: 'v3',
          asset: 'mappings.min.json',
          assetUpdatedAt: '2026-09-25T06:58:34Z',
          assetSha256: 'e224de82869f785889a677a1674c6ad5ffc0e4b06cea39ef8156f4b06f8846ee',
        },
        mappings: [],
      }),
    ).toThrow('Invalid AniBridge mapping snapshot: mapping checksum mismatch');
  });
});
