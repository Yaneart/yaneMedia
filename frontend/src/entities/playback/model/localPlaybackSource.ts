// A shared torrent history hint, never a server/helper session, file, grant or URL.
export const LOCAL_PLAYBACK_SOURCE_REF = 'local-torrent';

export function isLocalPlaybackSourceRef(sourceRef: string) {
  return sourceRef === LOCAL_PLAYBACK_SOURCE_REF;
}
