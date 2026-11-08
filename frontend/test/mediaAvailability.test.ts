import { afterEach, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import type {
  MediaAvailability,
  MediaSourceOption,
} from '../src/entities/media-source/model/mediaSource';
import { mediaAvailabilityQueryOptions } from '../src/entities/media-source/model/mediaAvailabilityQuery';
import { selectSettledAvailability } from '../src/entities/media-source/model/mediaAvailabilityProgress';
import { getMediaSourcePlaybackIssue } from '../src/entities/media-source/model/mediaSourcePlayback';

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function source(id: string, overrides: Partial<MediaSourceOption> = {}): MediaSourceOption {
  return {
    sourceRef: id,
    provider: id,
    kind: 'embed',
    label: id,
    url: `https://player.example/${id}`,
    availability: 'available',
    browserSupported: true,
    ...overrides,
  };
}
function availability(sources: MediaSourceOption[], degraded = false): MediaAvailability {
  return {
    sources,
    episodes: [],
    checkedAt: new Date().toISOString(),
    degraded,
    hasExpiredSources: false,
  };
}

test.each([false, true])(
  'degraded final SSE keeps old sources and publishes new providers (old degraded=%s)',
  async (degraded) => {
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
    const options = mediaAvailabilityQueryOptions(client, 'work_fixture');
    client.setQueryData(options.queryKey, {
      availability: availability([source('old')], degraded),
      settled: true,
    });
    globalThis.fetch = (async () =>
      new Response(
        `data: ${JSON.stringify({
          state: 'complete',
          availability: availability([source('new')], true),
        })}\n\n`,
        { headers: { 'Content-Type': 'text/event-stream' } },
      )) as typeof fetch;
    try {
      const result = await client.fetchQuery({ ...options, staleTime: 0, retry: false });
      expect(result.availability.sources.map((s) => s.sourceRef)).toEqual(['old', 'new']);
      expect(result.availability.degraded).toBe(true);
      expect(result.settled).toBe(true);
    } finally {
      client.clear();
    }
  },
);

test('partial recovery removes only expired links and accepts fresh replacements and restrictions', () => {
  const expired = source('expired', { expiresAt: new Date(Date.now() - 10000).toISOString() });
  const old = availability([expired, source('keep'), source('replace'), source('blocked')]);
  const next = availability(
    [
      source('replace', { url: 'https://player.example/fresh' }),
      source('blocked', { availability: 'region_locked' }),
    ],
    true,
  );
  const result = selectSettledAvailability(old, next);
  expect(result.sources.map((s) => s.sourceRef)).toEqual(['keep', 'replace', 'blocked']);
  expect(result.sources[1]?.url).toBe('https://player.example/fresh');
  expect(result.sources[2]?.availability).toBe('region_locked');
  expect(result.hasExpiredSources).toBe(true);
  expect(result.degraded).toBe(true);
});

test('complete recovery authoritatively removes sources no longer returned', () => {
  const next = availability([source('new')]);
  expect(selectSettledAvailability(availability([source('old')], true), next)).toBe(next);
});

test('partial recovery merges episode sources without mixing different coordinates', () => {
  const current = {
    ...availability([]),
    episodes: [{ seasonNumber: 1, episodeNumber: 1, sources: [source('old')] }],
  };
  const next = {
    ...availability([], true),
    episodes: [
      { seasonNumber: 1, episodeNumber: 1, sources: [source('new')] },
      { seasonNumber: 1, episodeNumber: 2, sources: [source('other')] },
    ],
  };
  const result = selectSettledAvailability(current, next);
  expect(result.episodes.map((e) => e.sources.map((s) => s.sourceRef))).toEqual([
    ['old', 'new'],
    ['other'],
  ]);
});

test('unknown validation permits an attempt but explicit restrictions still block playback', () => {
  expect(getMediaSourcePlaybackIssue(source('unknown', { availability: 'unknown' }))).toBeNull();
  expect(
    getMediaSourcePlaybackIssue(
      source('unsupported', { availability: 'unknown', browserSupported: false }),
    ),
  ).toBe('browser-unsupported');
  expect(
    getMediaSourcePlaybackIssue(source('blocked', { availability: 'temporarily_unavailable' })),
  ).toBe('temporarily-unavailable');
  expect(getMediaSourcePlaybackIssue(source('region', { availability: 'region_locked' }))).toBe(
    'region-locked',
  );
  expect(getMediaSourcePlaybackIssue(source('account', { availability: 'requires_account' }))).toBe(
    'account-required',
  );
});
