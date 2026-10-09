import { createMediaEngine } from '../../src/media/media-engine.config';

describe('Media Engine configuration', () => {
  it('keeps primary metadata providers ahead of bounded fallbacks', async () => {
    const engine = await createMediaEngine();

    expect(engine.getProviders().map(({ name }) => name)).toEqual([
      'tmdb-official',
      'shikimori-graphql',
      'tmdb',
      'kinobd',
      'cinemeta',
      'shikimori',
      'anilist',
      'tvmaze',
      'wikidata',
    ]);
    expect(
      engine
        .getProviders()
        .slice(0, 2)
        .map(({ configured }) => configured),
    ).toEqual([false, false]);
  });

  it('enables configured primaries and optional direct Kodik without exposing secrets', async () => {
    const engine = await createMediaEngine({
      TMDB_API_KEY: ' tmdb-server-secret ',
      MEDIA_ENGINE_SHIKIMORI_USER_AGENT: ' yaneMedia/1.0 ',
      KODIK_API_KEY: ' kodik-server-secret ',
    });

    expect(
      engine
        .getProviders()
        .slice(0, 2)
        .map(({ configured }) => configured),
    ).toEqual([true, true]);
    expect(engine.getStreamingProviders().map(({ name }) => name)).toEqual([
      'kodik-streaming',
      'aderom-streaming',
      'initem-streaming',
      'kinobd-streaming',
      'ddbb-streaming',
      'aniliberty-streaming',
      'veoveo-streaming',
      'videohub-streaming',
    ]);

    const serialized = JSON.stringify([
      ...engine.getProviders(),
      ...engine.getStreamingProviders(),
    ]);
    expect(serialized).not.toContain('tmdb-server-secret');
    expect(serialized).not.toContain('kodik-server-secret');
  });

  it('does not construct direct Kodik for blank configuration', async () => {
    const engine = await createMediaEngine({ KODIK_API_KEY: '   ' });

    expect(engine.getStreamingProviders().map(({ name }) => name)).not.toContain('kodik-streaming');
  });
});
