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
export { isTorrentPlaybackSourceRef, torrentPlaybackSourceRef } from './model/torrentSession';
export type {
  TorrentSession,
  TorrentFile,
  TorrentAudioTrack,
  TorrentFailureCode,
  TorrentSessionState,
} from './model/torrentSession';
