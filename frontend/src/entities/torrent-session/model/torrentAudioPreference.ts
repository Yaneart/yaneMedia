import type { TorrentAudioTrack } from './torrentSession';
import { torrentAccountSignal } from './torrentClientScope';

// Descriptive preference lasts for this account scope, never an opaque track ref.
let preference: { language: string | null; label: string; scope: AbortSignal } | null = null;

export function rememberTorrentAudio(track: TorrentAudioTrack): void {
  preference = { language: track.language, label: track.label, scope: torrentAccountSignal() };
}

export function preferredTorrentAudio(
  tracks: readonly TorrentAudioTrack[],
): TorrentAudioTrack | undefined {
  const saved = preference?.scope === torrentAccountSignal() ? preference : null;
  return (
    (saved &&
      tracks.find((track) => track.language === saved.language && track.label === saved.label)) ||
    (saved?.language && tracks.find((track) => track.language === saved.language)) ||
    tracks.find((track) => track.isDefault) ||
    tracks[0]
  );
}
