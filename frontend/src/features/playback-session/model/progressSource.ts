import { LOCAL_PLAYBACK_SOURCE_REF } from '@/entities/playback';
import { isTorrentPlaybackSourceRef } from '@/entities/torrent-session';

export function progressSourceRef(sourceRef: string): string {
  // History restores coordinates, never a live server or Companion session.
  return sourceRef.startsWith('local:') || isTorrentPlaybackSourceRef(sourceRef)
    ? LOCAL_PLAYBACK_SOURCE_REF
    : sourceRef;
}
