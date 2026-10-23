import {
  canTransitionTorrentSession,
  isVisibleTorrentSession,
} from '../../src/torrent/torrent-session.state';

describe('torrent session state graph', () => {
  it('allows the contract path and rejects skips and terminal resurrection', () => {
    expect(canTransitionTorrentSession('created', 'fetching_metadata')).toBe(true);
    expect(canTransitionTorrentSession('fetching_metadata', 'awaiting_file')).toBe(true);
    expect(canTransitionTorrentSession('awaiting_file', 'probing')).toBe(true);
    expect(canTransitionTorrentSession('probing', 'awaiting_playback')).toBe(true);
    expect(canTransitionTorrentSession('awaiting_playback', 'preparing')).toBe(true);
    expect(canTransitionTorrentSession('preparing', 'ready')).toBe(true);
    expect(canTransitionTorrentSession('ready', 'preparing')).toBe(true);
    expect(canTransitionTorrentSession('created', 'ready')).toBe(false);
    expect(canTransitionTorrentSession('stopped', 'created')).toBe(false);
    expect(canTransitionTorrentSession('expired', 'ready')).toBe(false);
  });

  it('hides cleanup states and keeps failure visible until expiry', () => {
    expect(isVisibleTorrentSession('failed')).toBe(true);
    for (const state of ['stopping', 'stopped', 'expiring', 'expired'] as const) {
      expect(isVisibleTorrentSession(state)).toBe(false);
    }
  });
});
