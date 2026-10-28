import {
  getTorrentSession,
  newTorrentIdempotencyKey,
  startTorrentPlayback,
  TorrentRequestError,
} from '../api/torrentSessionApi';
import type { TorrentSession } from './torrentSession';
import { torrentAccountSignal } from './torrentClientScope';

// Keep one logical key through uncertain admission. Abort cannot undo a POST:
// reconcile its outcome before letting the player's queue start another mutation.
export async function replaceTorrentPlayback(
  initial: TorrentSession,
  position: number,
  signal: AbortSignal,
): Promise<TorrentSession> {
  signal.throwIfAborted();
  const deadline = AbortSignal.any([AbortSignal.timeout(110_000), torrentAccountSignal()]);
  const key = newTorrentIdempotencyKey();
  let current = initial;
  let admittedVersion: number | null = null;
  let attempts = 0;
  const audio = initial.playback?.selectedAudioTrackRef;
  while (!deadline.aborted) {
    if (current.selectedFileRef !== initial.selectedFileRef)
      throw new Error('Playback file replaced');
    if (admittedVersion === null && current.state !== 'preparing') {
      if (++attempts > 4) throw new Error('Playback admission failed');
      try {
        current = await startTorrentPlayback(
          initial.id,
          position,
          current.version,
          key,
          deadline,
          audio,
        );
        admittedVersion = current.version;
      } catch (error) {
        if (
          !(error instanceof TorrentRequestError) ||
          !(
            error.kind === 'network' ||
            error.status === 409 ||
            [429, 502, 503, 504].includes(error.status ?? 0)
          )
        )
          throw error;
      }
    }
    if (admittedVersion !== null && current.state === 'ready') {
      if (
        current.version < admittedVersion ||
        current.playback?.startPositionSeconds !== position ||
        current.playback.selectedAudioTrackRef !== audio ||
        current.selectedFileRef !== initial.selectedFileRef
      )
        throw new Error('Playback generation replaced');
      signal.throwIfAborted();
      return current;
    }
    if (
      (admittedVersion !== null && current.failure) ||
      ['failed', 'awaiting_file'].includes(current.state) ||
      (admittedVersion !== null && current.state === 'awaiting_playback')
    )
      throw new Error('Playback preparation failed');
    await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
    try {
      current = await getTorrentSession(initial.id, deadline);
    } catch (error) {
      if (
        !(error instanceof TorrentRequestError) ||
        !(error.kind === 'network' || [429, 502, 503, 504].includes(error.status ?? 0))
      )
        throw error;
    }
  }
  throw new Error('Playback preparation timed out');
}
