import { join } from 'node:path';
import ts from 'typescript';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { HealthModule } from '../../src/health/health.module';
import { ApiResponseInterceptor } from '../../src/platform/http/api-response/api-response.interceptor';
import { PublicAppModule } from '../../src/app.public.module';

describe('Public build and runtime boundary', () => {
  it('compiles only the public entrypoint, shared business logic and metadata discovery', () => {
    const root = join(__dirname, '../..');
    const config = ts.readConfigFile(join(root, 'tsconfig.public.json'), ts.sys.readFile);
    expect(config.error).toBeUndefined();
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    expect(parsed.errors).toEqual([]);
    const program = ts.createProgram(parsed.fileNames, parsed.options);
    const sources = program
      .getSourceFiles()
      .filter((source) =>
        source.fileName.replaceAll('\\', '/').startsWith(`${root.replaceAll('\\', '/')}/src/`),
      );
    const names = sources.map((source) => source.fileName.replaceAll('\\', '/'));
    expect(names.some((name) => name.endsWith('/main.public.ts'))).toBe(true);
    expect(names.some((name) => name.endsWith('/auth/auth.repository.ts'))).toBe(true);
    expect(names.some((name) => name.endsWith('/torrent/torrent-discovery.controller.ts'))).toBe(
      true,
    );
    expect(names.some((name) => name.endsWith('/scripts/sync-editorial-catalog.ts'))).toBe(true);
    // Schema/state types remain shared so switching modes preserves Home data and logout cleanup.
    expect(names.some((name) => name.endsWith('/torrent/torrent-session.entity.ts'))).toBe(true);
    expect(
      names.some((name) =>
        /\/(?:main|app\.module|home-health\.module|home-torrent-readiness|torrent-metrics\.controller|torrserver\.client|torrserver\.config|torrent\.module|torrent-session-reconciler|torrent-session\.repository|torrent-stream\.gateway|torrent-playback\.service|torrent-input\.controller|torrent-hls\.[^/]+|torrent-subtitle\.service)\.ts$/.test(
          name,
        ),
      ),
    ).toBe(false);
    expect(sources.filter((source) => /(?:node:)?child_process/.test(source.text))).toEqual([]);
  });

  it.each([
    { TORRENT_STREAMING_ENABLED: true },
    { TORRSERVER_BASE_URL: 'http://engine:8090' },
    { TORRSERVER_USERNAME_FILE: '/private/username' },
    { TORRSERVER_PASSWORD_FILE: '/private/password' },
    { TORRENT_IDEMPOTENCY_SECRET_FILE: '/private/idempotency' },
  ])('rejects accidental server delivery configuration without leaking it: %j', (settings) => {
    expect(() => new PublicAppModule(new ConfigService(settings))).toThrow(
      'Public mode cannot enable server torrent playback or engine credentials.',
    );
  });

  it('allows metadata search configuration independently of server delivery', () => {
    expect(
      () =>
        new PublicAppModule(
          new ConfigService({
            TORRENT_STREAMING_ENABLED: false,
            JACRED_BASE_URL: 'https://catalog.example',
            KNABEN_BASE_URL: 'https://search.example',
          }),
        ),
    ).not.toThrow();
  });

  it('serves both readiness contracts without constructing engine or worker providers', async () => {
    const module = await Test.createTestingModule({ imports: [HealthModule] }).compile();
    const app = module.createNestApplication({ logger: false });
    app.setGlobalPrefix('api/v1');
    app.useGlobalInterceptors(new ApiResponseInterceptor());
    await app.listen(0, '127.0.0.1');
    try {
      const base = await app.getUrl();
      for (const [path, data] of [
        ['/health', { status: 'ok' }],
        ['/health/ready', { status: 'ready', features: { torrent: { status: 'disabled' } } }],
        ['/health/ready/torrent', { status: 'disabled' }],
      ] as const) {
        const response = await fetch(`${base}/api/v1${path}`);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ data });
      }
      for (const path of [
        '/torrent-sessions',
        '/torrent-hls/anything',
        '/health/torrent-metrics',
      ]) {
        expect((await fetch(`${await app.getUrl()}/api/v1${path}`)).status).toBe(404);
      }
    } finally {
      await app.close();
    }
  });
});
