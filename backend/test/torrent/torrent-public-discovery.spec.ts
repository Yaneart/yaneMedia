import { Global, Module, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import cookieParser from 'cookie-parser';
import { AppConfigModule } from '../../src/config/config.module';
import { AuthModule } from '../../src/auth/auth.module';
import { SessionGuard } from '../../src/auth/guards/session.guard';
import { CsrfGuard } from '../../src/auth/guards/csrf.guard';
import { MediaModule } from '../../src/media/media.module';
import { MediaRegistryService } from '../../src/media/registry/media-registry.service';
import { MediaService } from '../../src/media/media.service';
import { TorrentDiscoveryModule } from '../../src/torrent/torrent-discovery.module';
import { TORRENT_DISCOVERY_PORT } from '../../src/torrent/torrent-discovery.port';
import { TorrServerClient } from '../../src/torrent/torrserver.client';

const origin = 'https://watch.example';
const mediaRef = 'work_123e4567-e89b-42d3-a456-426614174000';
const findUser = jest.fn();
const search = jest.fn();
@Global()
@Module({
  providers: [
    {
      provide: ConfigService,
      useValue: new ConfigService({
        FRONTEND_ORIGIN: origin,
        NODE_ENV: 'test',
        TORRENT_STREAMING_ENABLED: false,
      }),
    },
  ],
  exports: [ConfigService],
})
class TestConfig {}
@Module({
  imports: [TestConfig],
  providers: [{ provide: SessionGuard, useValue: { findUser } }, CsrfGuard],
  exports: [SessionGuard, CsrfGuard],
})
class TestAuth {}
@Module({
  providers: [
    {
      provide: MediaRegistryService,
      useValue: { resolve: () => Promise.resolve({ mediaRef, type: 'movie' }) },
    },
    {
      provide: MediaService,
      useValue: {
        getSummaryByRef: () =>
          Promise.resolve({
            summary: { mediaRef, title: 'Fixture film', originalTitle: 'Fixture film', year: 2026 },
          }),
      },
    },
  ],
  exports: [MediaRegistryService, MediaService],
})
class TestMedia {}

describe('Public metadata discovery without engine or media workers', () => {
  let app: INestApplication;
  let base: string;
  beforeEach(async () => {
    findUser.mockImplementation((token: unknown) =>
      Promise.resolve(
        token === 'account-a' ? { id: 'a' } : token === 'account-b' ? { id: 'b' } : null,
      ),
    );
    search.mockResolvedValue({
      releases: [
        {
          guid: 'one',
          title: 'Fixture film 2026 1080p',
          tracker: 'Example',
          size: 16384,
          seeders: 1,
          publishedAt: null,
          downloadUrl: `magnet:?xt=urn:btih:${'a'.repeat(40)}`,
          infoHash: 'a'.repeat(40),
        },
      ],
      degraded: false,
    });
    const module = await Test.createTestingModule({ imports: [TorrentDiscoveryModule] })
      .overrideModule(AppConfigModule)
      .useModule(TestConfig)
      .overrideModule(AuthModule)
      .useModule(TestAuth)
      .overrideModule(MediaModule)
      .useModule(TestMedia)
      .overrideProvider(TORRENT_DISCOVERY_PORT)
      .useValue({ search })
      .overrideProvider(CsrfGuard)
      .useValue(new CsrfGuard(new ConfigService({ FRONTEND_ORIGIN: origin })))
      .compile();
    expect(() => module.get(TorrServerClient)).toThrow();
    app = module.createNestApplication({ logger: false });
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    base = `${await app.getUrl()}/api/v1/torrent-discovery`;
  });
  afterEach(async () => app?.close());
  async function candidates(cookie?: string) {
    return fetch(`${base}/candidates?mediaRef=${mediaRef}`, {
      headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}) },
    });
  }
  async function resolve(ref: string, cookie: string, csrf = true) {
    return fetch(`${base}/resolve`, {
      method: 'POST',
      headers: {
        Origin: origin,
        Cookie: cookie,
        'Content-Type': 'application/json',
        ...(csrf ? { 'X-YaneMedia-CSRF': '1' } : {}),
      },
      body: JSON.stringify({ candidateRef: ref }),
    });
  }
  it('gives guests opaque results and a short-lived locator in their own context', async () => {
    const response = await candidates();
    expect(response.status).toBe(200);
    const cookie = response.headers.get('set-cookie')!.split(';')[0];
    expect(cookie).toMatch(/^yanemedia_discovery=[a-f0-9]{64}$/);
    expect(response.headers.get('set-cookie')).toContain('HttpOnly');
    const body = (await response.json()) as { candidates: { candidateRef: string }[] };
    expect(JSON.stringify(body)).not.toContain('magnet:');
    const ref = body.candidates[0].candidateRef;
    const other = await candidates();
    const otherCookie = other.headers.get('set-cookie')!.split(';')[0];
    expect((await resolve(ref, otherCookie)).status).toBe(404);
    expect((await resolve(ref, cookie, false)).status).toBe(403);
    const resolved = await resolve(ref, cookie);
    expect(resolved.status).toBe(200);
    expect(resolved.headers.get('cache-control')).toContain('no-store');
    const locator = (await resolved.json()) as { locator: { kind: string }; expiresAt: string };
    expect(locator.locator.kind).toBe('magnet');
    expect(Date.parse(locator.expiresAt) - Date.now()).toBeLessThanOrEqual(120000);
    expect(
      (
        await fetch(`${base}/from-candidate`, {
          method: 'POST',
          headers: {
            Origin: origin,
            Cookie: cookie,
            'Content-Type': 'application/json',
            'X-YaneMedia-CSRF': '1',
          },
          body: JSON.stringify({ candidateRef: ref }),
        })
      ).status,
    ).toBe(404);
  });
  it('isolates guest, account A, account B and logout without requiring verified email', async () => {
    const response = await candidates('yanemedia_session=account-a');
    const ref = ((await response.json()) as { candidates: { candidateRef: string }[] })
      .candidates[0].candidateRef;
    expect((await resolve(ref, 'yanemedia_session=account-a')).status).toBe(200);
    expect((await resolve(ref, 'yanemedia_session=account-b')).status).toBe(404);
    const guest = await candidates();
    expect((await resolve(ref, guest.headers.get('set-cookie')!.split(';')[0])).status).toBe(404);
  });
  it('rejects cross-site requests before session lookup and bounds guest searches', async () => {
    findUser.mockClear();
    expect(
      (
        await fetch(`${base}/candidates?mediaRef=${mediaRef}`, {
          headers: { Origin: 'https://evil.example' },
        })
      ).status,
    ).toBe(403);
    expect(findUser).not.toHaveBeenCalled();
    const first = await candidates();
    const cookie = first.headers.get('set-cookie')!.split(';')[0];
    for (let i = 0; i < 5; i++) expect((await candidates(cookie)).status).toBe(200);
    expect((await candidates(cookie)).status).toBe(429);
  });
  it('never returns provider passkeys', async () => {
    search.mockResolvedValue({
      releases: [
        {
          guid: 'private',
          title: 'Fixture film',
          tracker: 'Example',
          size: 1,
          seeders: 1,
          publishedAt: null,
          downloadUrl: `magnet:?xt=urn:btih:${'a'.repeat(40)}&tr=${encodeURIComponent('https://tracker.example/announce?passkey=secret')}`,
          infoHash: 'a'.repeat(40),
        },
      ],
      degraded: false,
    });
    const response = await candidates();
    expect(((await response.json()) as { candidates: unknown[] }).candidates).toEqual([]);
  });
});
