// A finite VOD window keeps pause/rate independent of the worker's read speed.
// At most one window per session survives replacement; no rolling live edge.
export const TORRENT_WINDOW_SECONDS = 120;
export const TORRENT_WINDOW_SEGMENTS = 64;
export const TORRENT_WINDOW_BYTES = 128 * 1024 * 1024;

export type TorrentTimeline = {
  absoluteAnchorSeconds: number;
  mediaAnchorSeconds: number;
  windowEndSeconds: number;
};
