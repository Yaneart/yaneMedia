// Continuous playback starts from a measured prefix. The retained segment cache
// is bounded by bytes and distance ahead of the confirmed viewer.
export const TORRENT_WINDOW_SECONDS = 120;
export const TORRENT_STARTUP_SECONDS = 6;
export const TORRENT_WINDOW_SEGMENTS = 64;
export const TORRENT_WINDOW_BYTES = 128 * 1024 * 1024;
// Original streams split at source keyframes: a VBR GOP can exceed 32 MiB.
// Reserve the rest of the 128 MiB cache for that GOP and the monitor's interval.
export const TORRENT_WINDOW_TARGET_BYTES = 48 * 1024 * 1024;
export const TORRENT_SEGMENT_BYTES = 64 * 1024 * 1024;

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
  // Continuous HLS ends only at film EOF; old persisted finite windows omit this.
  continuous?: boolean;
  absoluteAnchorSeconds: number;
  mediaAnchorSeconds: number;
  // Published edge at readiness; browser ranges may grow until window completion.
  windowEndSeconds: number;
};
