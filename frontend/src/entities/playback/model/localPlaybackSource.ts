// A history hint, never a helper session, file, grant or URL.
export const LOCAL_PLAYBACK_SOURCE_REF = 'local-torrent';

export function isLocalPlaybackSourceRef(sourceRef: string) {
  return sourceRef === LOCAL_PLAYBACK_SOURCE_REF;
}
