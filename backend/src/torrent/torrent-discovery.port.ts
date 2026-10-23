export type DiscoveryKind = 'movie' | 'tv' | 'anime';
export const TORRENT_DISCOVERY_PORT = Symbol('TORRENT_DISCOVERY_PORT');

export interface DiscoverySearch {
  query: string;
  title?: string;
  kind: DiscoveryKind;
  limit: number;
  offset: number;
}

export interface DiscoveryRelease {
  guid: string | null;
  title: string;
  tracker: string;
  size: number;
  seeders: number | null;
  publishedAt: string | null;
  downloadUrl: string;
  infoHash: string | null;
  stale?: boolean;
  catalog?: 'JacRed';
}

export interface DiscoverySearchResult {
  releases: DiscoveryRelease[];
  degraded: boolean;
}

// The download URL is server-only. API controllers must map it to an opaque candidateRef.
export interface TorrentDiscoveryPort {
  search(input: DiscoverySearch, signal: AbortSignal): Promise<DiscoverySearchResult>;
}
