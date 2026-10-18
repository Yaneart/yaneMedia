import type { TorrentSessionState } from './torrent-session.entity';

const transitions: Record<TorrentSessionState, readonly TorrentSessionState[]> = {
  created: ['fetching_metadata', 'failed', 'stopping', 'expiring'],
  fetching_metadata: ['awaiting_file', 'probing', 'failed', 'stopping', 'expiring'],
  awaiting_file: ['probing', 'failed', 'stopping', 'expiring'],
  probing: ['awaiting_playback', 'failed', 'stopping', 'expiring'],
  awaiting_playback: ['probing', 'preparing', 'failed', 'stopping', 'expiring'],
  preparing: ['ready', 'awaiting_playback', 'failed', 'stopping', 'expiring'],
  ready: ['preparing', 'probing', 'awaiting_playback', 'failed', 'stopping', 'expiring'],
  failed: ['stopping', 'expiring'],
  stopping: ['stopped'],
  stopped: [],
  expiring: ['expired'],
  expired: [],
};

export const activeTorrentStates: TorrentSessionState[] = [
  'created',
  'fetching_metadata',
  'awaiting_file',
  'probing',
  'awaiting_playback',
  'preparing',
  'ready',
];

export function canTransitionTorrentSession(
  from: TorrentSessionState,
  to: TorrentSessionState,
): boolean {
  return transitions[from].includes(to);
}

export function isVisibleTorrentSession(state: TorrentSessionState): boolean {
  return activeTorrentStates.includes(state) || state === 'failed';
}
