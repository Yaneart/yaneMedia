// Append-only finite windows retain every published segment, including on pause.
// Playback starts from a measured prefix while the bounded worker fills the rest.
export const TORRENT_WINDOW_SECONDS = 120;
export const TORRENT_STARTUP_SECONDS = 6;
export const TORRENT_WINDOW_SEGMENTS = 64;
export const TORRENT_WINDOW_BYTES = 128 * 1024 * 1024;

export type TorrentTimeline = {
  absoluteAnchorSeconds: number;
  mediaAnchorSeconds: number;
  // Published edge at readiness; browser ranges may grow until window completion.
  windowEndSeconds: number;
};
