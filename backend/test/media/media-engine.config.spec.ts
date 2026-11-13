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

  it('enables configured primaries and token-backed streaming without exposing secrets', async () => {
    const engine = await createMediaEngine({
      TMDB_API_KEY: ' tmdb-server-secret ',
      MEDIA_ENGINE_SHIKIMORI_USER_AGENT: ' yaneMedia/1.0 ',
      KODIK_API_KEY: ' kodik-server-secret ',
      VEOVEO_API_KEY: ' veoveo-server-secret ',
      FILMIX_API_KEY: ' filmix-server-secret ',
    });

    expect(
      engine
        .getProviders()
        .slice(0, 2)
        .map(({ configured }) => configured),
    ).toEqual([true, true]);
    expect(engine.getStreamingProviders().map(({ name }) => name)).toEqual([
      'kodik-streaming',
      'filmix-streaming',
      'rutube-streaming',
      'aderom-streaming',
      'initem-streaming',
      'kinobd-streaming',
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
    expect(serialized).not.toContain('veoveo-server-secret');
    expect(serialized).not.toContain('filmix-server-secret');
  });

  it('does not construct token-backed streaming for missing or blank configuration', async () => {
    for (const env of [
      {},
      { KODIK_API_KEY: '   ', VEOVEO_API_KEY: '   ', FILMIX_API_KEY: '   ' },
    ]) {
      const engine = await createMediaEngine(env);

      const names = engine.getStreamingProviders().map(({ name }) => name);
      for (const name of ['kodik-streaming', 'veoveo-streaming', 'filmix-streaming']) {
        expect(names).not.toContain(name);
      }
    }
  });

  it('supports the operator-approved Filmix HTTP API and HTTPS overrides', async () => {
    for (const baseUrl of ['http://filmix-api.test/api/v2', 'https://filmix-api.test/api/v2']) {
      const engine = await createMediaEngine({
        FILMIX_API_KEY: 'filmix-server-secret',
        FILMIX_API_BASE_URL: baseUrl,
      });
      expect(engine.getStreamingProviders().map(({ name }) => name)).toContain('filmix-streaming');
    }
  });

  it('enables token-free Rutube for movies', async () => {
    const engine = await createMediaEngine();
    const providers = engine.getStreamingProviders();
    expect(
      providers.find(({ name }) => name === 'rutube-streaming')?.capabilities.mediaTypes,
    ).toEqual(['movie']);
  });

  it('registers the six direct balancers without DDBB or serialized credentials', async () => {
    const engine = await createMediaEngine({
      VIBIX_API_KEY: 'private-vibix',
      COLLAPS_API_KEY: 'private-collaps',
      ALOHA_API_KEY: 'public-alloha',
      MIRAGE_API_KEY: 'public-mirage',
      VIDEOSEED_API_KEY: 'private-videoseed',
      VIDEOSEED_PLAYER_TOKEN: 'public-videoseed',
      HDVB_API_KEY: 'private-hdvb',
    });
    const providers = engine.getStreamingProviders();
    expect(providers.slice(0, 6).map(({ name }) => name)).toEqual([
      'vibix-streaming',
      'collaps-streaming',
      'alloha-streaming',
      'mirage-streaming',
      'videoseed-streaming',
      'hdvb-streaming',
    ]);
    expect(providers.some(({ name }) => name === 'ddbb-streaming')).toBe(false);
    expect(JSON.stringify(providers)).not.toMatch(/private-|public-/);
    for (const provider of providers.slice(0, 6)) {
      expect(provider.capabilities.mediaTypes).toEqual(['movie', 'series', 'anime']);
    }
  });

  it('skips blank direct balancer credentials and does not silently restore DDBB', async () => {
    const engine = await createMediaEngine({
      VIBIX_API_KEY: ' ',
      COLLAPS_API_KEY: ' ',
      ALOHA_API_KEY: ' ',
      MIRAGE_API_KEY: ' ',
      VIDEOSEED_API_KEY: ' ',
      HDVB_API_KEY: ' ',
    });
    const names = engine.getStreamingProviders().map(({ name }) => name);
    expect(names).not.toContain('ddbb-streaming');
    for (const name of ['vibix', 'collaps', 'alloha', 'mirage', 'videoseed', 'hdvb']) {
      expect(names).not.toContain(`${name}-streaming`);
    }
  });
});
