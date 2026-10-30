import {
  torrentWindowSeconds,
  TORRENT_WINDOW_TARGET_BYTES,
} from '../../src/torrent/torrent-playback-window';

describe('byte-aware torrent window', () => {
  it('keeps the normal window and shortens known heavy streams with muxing headroom', () => {
    expect(torrentWindowSeconds(5_000_000)).toBe(107);
    const heavy = torrentWindowSeconds(50_000_000);
    expect(heavy).toBe(10);
    expect(((heavy * 50_000_000) / 8) * 1.25).toBeLessThanOrEqual(TORRENT_WINDOW_TARGET_BYTES);
    expect(torrentWindowSeconds(null)).toBe(120);
    expect(torrentWindowSeconds(1_000_000)).toBe(120);
  });
  it('reserves the requested seek preroll plus startup data without exceeding the time ceiling', () => {
    expect(torrentWindowSeconds(100_000_000, 18)).toBe(18);
    expect(torrentWindowSeconds(100_000_000, 150)).toBe(120);
  });
});
