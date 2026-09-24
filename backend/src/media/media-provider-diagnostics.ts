import { AsyncLocalStorage } from 'node:async_hooks';
import type { MediaProvider, ResponseMeta } from '@media-engine/core';

type Operation = 'search' | 'details' | 'availability' | 'related';
type ProviderCounts = Map<string, number>;

const calls = new AsyncLocalStorage<ProviderCounts>();

export function withProviderCounts<T>(
  execute: () => Promise<T>,
): Promise<{ result: T; counts: ProviderCounts }> {
  const counts: ProviderCounts = new Map();
  return calls.run(counts, async () => ({ result: await execute(), counts }));
}

export function countProviderResults(provider: MediaProvider): MediaProvider {
  return {
    ...provider,
    async search(query, context) {
      const results = await provider.search(query, context);
      calls.getStore()?.set(provider.name, results.length);
      return results;
    },
    ...(provider.getDetails && {
      async getDetails(query, context) {
        const result = await provider.getDetails!(query, context);
        calls.getStore()?.set(provider.name, result ? 1 : 0);
        return result;
      },
    }),
    ...(provider.getRelatedMedia && {
      async getRelatedMedia(query, context) {
        const result = await provider.getRelatedMedia!(query, context);
        calls.getStore()?.set(provider.name, result?.relations.length ?? 0);
        return result;
      },
    }),
  };
}

const PROVIDERS = new Set([
  'kinobd',
  'cinemeta',
  'shikimori',
  'anilist',
  'tvmaze',
  'kinobd-streaming',
  'ddbb-streaming',
  'aniliberty-streaming',
  'veoveo-streaming',
  'videohub-streaming',
]);
const FAILURE_CODES = new Set([
  'PROVIDER_ERROR',
  'PROVIDER_TIMEOUT',
  'PROVIDER_UNAUTHORIZED',
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_INVALID_RESPONSE',
  'PROVIDER_RESPONSE_TOO_LARGE',
  'PROVIDER_NOT_SUPPORTED',
]);

export interface ProviderDiagnostic {
  provider: string;
  operation: Operation;
  code: string;
  durationMs: number | null;
  acceptedSources: number;
  resultCount: number | null;
  degraded: boolean;
}

export function providerDiagnostics(
  operation: Operation,
  meta: ResponseMeta,
  counts: ReadonlyMap<string, number> = new Map(),
  acceptedSources: ReadonlyMap<string, number> = new Map(),
): ProviderDiagnostic[] {
  const degraded =
    meta.stale === true || meta.providers.failed.length > 0 || (meta.warnings?.length ?? 0) > 0;
  const failures = new Map(
    meta.providers.failed.map((failure) => [failure.provider, failure.code]),
  );
  const successful = new Set(meta.providers.successful);
  return [...new Set(meta.providers.requested)]
    .filter((provider) => PROVIDERS.has(provider))
    .map((provider) => {
      const timing = meta.debug?.timings.find((entry) => entry.provider === provider);
      const resultCount =
        operation === 'availability'
          ? (acceptedSources.get(provider) ?? 0)
          : (counts.get(provider) ?? null);
      const failure = failures.get(provider);
      const code = meta.cached
        ? 'CACHED'
        : failure
          ? FAILURE_CODES.has(failure)
            ? failure
            : 'PROVIDER_ERROR'
          : successful.has(provider)
            ? resultCount === 0
              ? 'EMPTY'
              : 'SUCCESS'
            : 'UNKNOWN';
      return {
        provider,
        operation,
        code,
        durationMs: meta.cached
          ? null
          : timing && Number.isFinite(timing.tookMs)
            ? Math.max(0, Math.round(timing.tookMs))
            : null,
        acceptedSources: operation === 'availability' ? (resultCount ?? 0) : 0,
        resultCount,
        degraded,
      };
    });
}
