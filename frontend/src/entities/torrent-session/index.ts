export {
  createMagnetSession,
  createFileSession,
  getTorrentSession,
  getActiveTorrentSession,
  selectTorrentFile,
  startTorrentPlayback,
  stopTorrentSession,
  newTorrentIdempotencyKey,
  TorrentRequestError,
  toTorrentRequestError,
} from './api/torrentSessionApi';
export {
  cacheTorrentSession,
  activeTorrentSessionQueryOptions,
  torrentPollInterval,
  torrentSessionQueryKeys,
  torrentSessionQueryOptions,
} from './model/torrentSessionQuery';
export { registerTorrentPlayerStop, resetTorrentClientScope } from './model/torrentClientScope';
export { replaceTorrentPlayback } from './model/replaceTorrentPlayback';
export { isTorrentPlaybackSourceRef, torrentPlaybackSourceRef } from './model/torrentSession';
export { createCandidateSession, getTorrentCandidates } from './api/torrentDiscovery';
export type { TorrentCandidate, TorrentCandidates } from './api/torrentDiscovery';
export type {
  TorrentSession,
  TorrentFile,
  TorrentAudioTrack,
  TorrentFailureCode,
  TorrentSessionState,
} from './model/torrentSession';
