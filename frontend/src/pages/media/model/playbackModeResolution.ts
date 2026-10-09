import type { PlaybackMode } from '../../../features/source-selection';

export function shouldShowLocalEpisodeControls(
  playbackMode: PlaybackMode,
  usesDirectEpisodes: boolean,
  hasPlayerManagedEpisodeEmbed: boolean,
) {
  return usesDirectEpisodes && (playbackMode === 'direct' || !hasPlayerManagedEpisodeEmbed);
}

export function resolveAvailablePlaybackMode(
  currentMode: PlaybackMode,
  hasEmbedMode: boolean,
  hasDirectMode: boolean,
  directModePending: boolean,
): PlaybackMode {
  if (currentMode === 'embed' && !hasEmbedMode && hasDirectMode) return 'direct';
  if (currentMode === 'direct' && !hasDirectMode && hasEmbedMode && !directModePending) {
    return 'embed';
  }

  return currentMode;
}
