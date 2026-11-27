import { useEffect, useState } from 'react';
import type { MediaSourceOption } from '@/entities/media-source';

// The availability mapper wraps Media Engine's AniLiberty release/episode/quality ID.
const episodeSourceRef =
  /^stream:aniliberty-streaming:aniliberty-streaming:(\d+):([\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}):(480|720|1080)$/i;

type EpisodeResponse = {
  id?: string;
  release?: {
    id?: number;
    is_blocked_by_geo?: boolean;
    is_blocked_by_copyrights?: boolean;
  };
} & Partial<Record<`hls_${string}`, string | null>>;

async function loadPlaybackUrl(
  episodeId: string,
  releaseId: string,
  height: string,
  fallback: string,
  signal: AbortSignal,
): Promise<string | null> {
  const field = `hls_${height}` as const;
  const endpoint = new URL(`/api/v1/anime/releases/episodes/${episodeId}`, 'https://anilibria.top');
  endpoint.searchParams.set('include', `id,release,${field}`);

  try {
    const response = await fetch(endpoint, {
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(3_000)]),
    });
    if (!response.ok) return fallback;

    const episode: EpisodeResponse = await response.json();
    const release = episode?.release;
    if (episode?.id !== episodeId || release?.id !== Number(releaseId)) return fallback;
    if (release.is_blocked_by_geo || release.is_blocked_by_copyrights) return null;

    const playbackUrl = episode[field];
    if (typeof playbackUrl !== 'string') return fallback;
    const url = new URL(playbackUrl);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      url.hostname.endsWith('.libria.fun') &&
      url.pathname.endsWith('.m3u8')
      ? playbackUrl
      : fallback;
  } catch {
    return fallback;
  }
}

export function useAniLibertyPlaybackUrl({ provider, kind, sourceRef, url }: MediaSourceOption) {
  const match =
    provider === 'aniliberty-streaming' && kind === 'hls' ? episodeSourceRef.exec(sourceRef) : null;
  const [, releaseId, episodeId, height] = match ?? [];
  const [resolved, setResolved] = useState<{
    sourceRef: string;
    fallback: string;
    url: string | null;
  }>();

  useEffect(() => {
    if (!episodeId) return;
    const controller = new AbortController();
    // The provider selects its CDN based on the IP that makes this request.
    void loadPlaybackUrl(episodeId, releaseId, height, url, controller.signal).then(
      (playbackUrl) => {
        if (!controller.signal.aborted) setResolved({ sourceRef, fallback: url, url: playbackUrl });
      },
    );
    return () => controller.abort();
  }, [episodeId, releaseId, height, sourceRef, url]);

  if (!match) return url;
  return resolved?.sourceRef === sourceRef && resolved.fallback === url ? resolved.url : undefined;
}
