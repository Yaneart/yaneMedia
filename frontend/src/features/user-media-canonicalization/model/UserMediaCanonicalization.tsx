import { useEffect, useMemo } from 'react';

import { useMediaSummaryResolution } from '@/entities/media';
import { useFavorites } from '@/features/favorite';
import { useOpeningHistory } from '@/features/opening-history';
import { usePlaybackSession } from '@/features/playback-session';

import { collectLegacyUserMediaLocators } from './userMediaLocators';

export function UserMediaCanonicalization() {
  const { favoriteMediaRefs, canonicalizeFavorites } = useFavorites();
  const { openingHistoryEntries, canonicalizeHistory } = useOpeningHistory();
  const { session, continueWatchingEntries, canonicalizeContinueWatching } = usePlaybackSession();
  const legacyLocators = useMemo(
    () =>
      collectLegacyUserMediaLocators([
        favoriteMediaRefs,
        openingHistoryEntries.map(({ mediaRef }) => mediaRef),
        continueWatchingEntries.map(({ mediaRef }) => mediaRef),
        session ? [session.mediaRef] : undefined,
      ]),
    [continueWatchingEntries, favoriteMediaRefs, openingHistoryEntries, session],
  );
  const { resolution } = useMediaSummaryResolution(legacyLocators);

  useEffect(() => {
    if (!resolution || resolution.canonicalMediaRefs.size === 0) return;
    canonicalizeFavorites(resolution.canonicalMediaRefs);
    canonicalizeHistory(resolution.canonicalMediaRefs);
    canonicalizeContinueWatching(resolution.canonicalMediaRefs);
  }, [canonicalizeContinueWatching, canonicalizeFavorites, canonicalizeHistory, resolution]);

  return null;
}
