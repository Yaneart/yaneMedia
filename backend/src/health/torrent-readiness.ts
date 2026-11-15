export type TorrentReadiness = { status: 'ready' | 'disabled' | 'degraded' };
export const TORRENT_READINESS = Symbol('TORRENT_READINESS');
export interface TorrentReadinessProbe {
  check(): Promise<TorrentReadiness>;
}
