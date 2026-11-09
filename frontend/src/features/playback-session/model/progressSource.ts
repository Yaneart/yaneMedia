import { LOCAL_PLAYBACK_SOURCE_REF } from '@/entities/playback';
import { isTorrentPlaybackSourceRef } from '@/entities/torrent-session';
import { SERVER_TORRENT_ENABLED } from '@/shared/config/serverTorrent';

export function progressSourceRef(sourceRef: string): string {
  // Public can keep Home progress, but cannot restore its server session.
  return sourceRef.startsWith('local:') ||
    (!SERVER_TORRENT_ENABLED && isTorrentPlaybackSourceRef(sourceRef))
    ? LOCAL_PLAYBACK_SOURCE_REF
    : sourceRef;
}
