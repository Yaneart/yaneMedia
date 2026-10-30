// Append-only finite windows retain every published segment, including on pause.
// Playback starts from a measured prefix while the bounded worker fills the rest.
export const TORRENT_WINDOW_SECONDS = 120;
export const TORRENT_STARTUP_SECONDS = 6;
export const TORRENT_WINDOW_SEGMENTS = 64;
export const TORRENT_WINDOW_BYTES = 128 * 1024 * 1024;
// Leave room for the current GOP, muxer buffers and graceful finalization.
export const TORRENT_WINDOW_TARGET_BYTES = 80 * 1024 * 1024;
export const TORRENT_SEGMENT_BYTES = 32 * 1024 * 1024;

export function torrentWindowSeconds(
  bitrate: number | null,
  minimum = TORRENT_STARTUP_SECONDS + 2,
) {
  const estimated =
    bitrate && Number.isFinite(bitrate) && bitrate > 0
      ? Math.floor((TORRENT_WINDOW_TARGET_BYTES * 8) / (bitrate * 1.25))
      : TORRENT_WINDOW_SECONDS;
  return Math.min(TORRENT_WINDOW_SECONDS, Math.max(minimum, estimated));
}

export type TorrentTimeline = {
  absoluteAnchorSeconds: number;
  mediaAnchorSeconds: number;
  // Published edge at readiness; browser ranges may grow until window completion.
  windowEndSeconds: number;
};
