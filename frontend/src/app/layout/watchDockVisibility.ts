import type { PlaybackSession } from '@/entities/playback';

export function isActivePlaybackMediaRoute(
  session: PlaybackSession | null,
  routeMediaRef: string | undefined,
) {
  if (!session || !routeMediaRef) return false;

  let decodedRouteRef = routeMediaRef;

  try {
    decodedRouteRef = decodeURIComponent(routeMediaRef);
  } catch {
    // Keep the original route value if it contains malformed encoding.
  }

  return decodedRouteRef === session.mediaRef || decodedRouteRef === session.mediaSnapshot.slug;
}
