import type { MediaProvider, ResponseMeta } from '@media-engine/core';
import { ServiceUnavailableException } from '@nestjs/common';
import { MediaService } from '../../src/media/media.service';
import {
  countProviderResults,
  providerDiagnostics,
  withProviderCounts,
} from '../../src/media/media-provider-diagnostics';
import type { AppLogger } from '../../src/platform/logging/app-logger';

const meta: ResponseMeta = {
  providers: {
    requested: ['cinemeta', 'kinobd', 'anilist', 'untrusted-provider'],
    successful: ['cinemeta', 'anilist', 'untrusted-provider'],
    failed: [
      {
        provider: 'kinobd',
        code: 'PROVIDER_TIMEOUT',
        retryable: true,
        message: 'https://secret.example/token',
      },
    ],
  },
  cached: false,
  tookMs: 10,
  warnings: [{ code: 'PARTIAL', message: 'secret payload' }],
  debug: {
    providers: ['cinemeta', 'kinobd', 'anilist'],
    timings: [
      { provider: 'cinemeta', status: 'success', tookMs: 12 },
      { provider: 'kinobd', status: 'failed', tookMs: 5001 },
      { provider: 'anilist', status: 'success', tookMs: 8 },
    ],
  },
};

describe('provider diagnostics', () => {
  it('reports successful, empty, and timed out metadata providers without unsafe fields', () => {
    const events = providerDiagnostics(
      'details',
      meta,
      new Map([
        ['cinemeta', 1],
        ['anilist', 0],
      ]),
    );

    expect(events).toEqual([
      {
        provider: 'cinemeta',
        operation: 'details',
        code: 'SUCCESS',
        durationMs: 12,
        acceptedSources: 0,
        resultCount: 1,
        degraded: true,
      },
      {
        provider: 'kinobd',
        operation: 'details',
        code: 'PROVIDER_TIMEOUT',
        durationMs: 5001,
        acceptedSources: 0,
        resultCount: null,
        degraded: true,
      },
      {
        provider: 'anilist',
        operation: 'details',
        code: 'EMPTY',
        durationMs: 8,
        acceptedSources: 0,
        resultCount: 0,
        degraded: true,
      },
    ]);
    expect(JSON.stringify(events)).not.toMatch(/secret|https|untrusted-provider/);
  });

  it('counts accepted availability sources and keeps cache timing honest', () => {
    const availabilityMeta = {
      ...meta,
      providers: {
        requested: ['ddbb-streaming', 'aniliberty-streaming'],
        successful: ['ddbb-streaming', 'aniliberty-streaming'],
        failed: [],
      },
    };
    expect(
      providerDiagnostics(
        'availability',
        availabilityMeta,
        undefined,
        new Map([['ddbb-streaming', 2]]),
      ),
    ).toMatchObject([
      { provider: 'ddbb-streaming', code: 'SUCCESS', acceptedSources: 2 },
      { provider: 'aniliberty-streaming', code: 'EMPTY', acceptedSources: 0 },
    ]);
    expect(providerDiagnostics('details', { ...meta, cached: true })[0]).toMatchObject({
      code: 'CACHED',
      durationMs: null,
    });
  });

  it('records an empty provider response within the request context', async () => {
    const provider = countProviderResults({
      name: 'anilist',
      kind: 'metadata',
      capabilities: {} as MediaProvider['capabilities'],
      search: () => Promise.resolve([]),
      getDetails: () => Promise.resolve(null),
    });
    const { counts } = await withProviderCounts(() =>
      provider.getDetails!({ ids: { aniList: '199' } }, {}),
    );
    expect(counts.get('anilist')).toBe(0);
  });

  it('logs only mapped playable sources for availability', async () => {
    const logProviderDiagnostic = jest.fn();
    const logger = { logPerformance: jest.fn(), logProviderDiagnostic } as unknown as AppLogger;
    const engine = {
      getDetails: () =>
        Promise.resolve({
          details: { type: 'movie', title: 'Dune', ids: { imdb: 'tt1160419' } },
        }),
      getAvailability: () =>
        Promise.resolve({
          options: [
            {
              id: 'embed',
              provider: 'ddbb-streaming',
              player: { kind: 'embed', label: 'Embed', providerPlayerId: 'embed' },
              access: { url: 'https://secret.example/embed' },
              availability: 'available',
            },
            {
              id: 'broken',
              provider: 'ddbb-streaming',
              player: { kind: 'embed', label: 'Broken', providerPlayerId: 'broken' },
              access: {},
              availability: 'available',
            },
          ],
          episodes: [],
          checkedAt: '2026-09-24T00:00:00.000Z',
          meta: {
            providers: {
              requested: ['ddbb-streaming', 'aniliberty-streaming'],
              successful: ['ddbb-streaming', 'aniliberty-streaming'],
              failed: [],
            },
            cached: false,
            tookMs: 10,
          },
        }),
    };
    const service = new MediaService(engine as never, logger);

    await service.getAvailabilityByRef('imdb:tt1160419');

    expect(logProviderDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'ddbb-streaming', code: 'SUCCESS', acceptedSources: 1 }),
    );
    expect(logProviderDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'aniliberty-streaming',
        code: 'EMPTY',
        acceptedSources: 0,
      }),
    );
    expect(JSON.stringify(logProviderDiagnostic.mock.calls)).not.toMatch(/secret|tt1160419/);
  });

  it('logs provider failures even when the engine rejects the whole request', async () => {
    const logProviderDiagnostic = jest.fn();
    const logger = { logPerformance: jest.fn(), logProviderDiagnostic } as unknown as AppLogger;
    const engine = {
      getDetails: () =>
        Promise.reject(
          Object.assign(new Error('secret URL'), {
            name: 'MediaEngineError',
            code: 'PROVIDER_ERROR',
            cause: {
              failed: [{ provider: 'kinobd', code: 'PROVIDER_TIMEOUT', message: 'secret URL' }],
            },
          }),
        ),
    };
    const service = new MediaService(engine as never, logger);

    await expect(service.getDetailsByRef('imdb:tt2788316')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(logProviderDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'media.provider_diagnostic',
        provider: 'kinobd',
        code: 'PROVIDER_TIMEOUT',
        degraded: true,
      }),
    );
    expect(JSON.stringify(logProviderDiagnostic.mock.calls)).not.toMatch(/secret|tt2788316/);
  });
});
