import {
  getTorrentSession,
  newTorrentIdempotencyKey,
  startTorrentPlayback,
  selectTorrentAudio,
  supportsPreparedTorrentAudio,
  TorrentRequestError,
} from '../api/torrentSessionApi';
import type { TorrentSession, TorrentSessionState } from './torrentSession';
import { torrentAccountSignal } from './torrentClientScope';
import { torrentOutputProfile } from './torrentOutputProfile';

// Keep one logical key through uncertain admission. Abort cannot undo a POST:
// A successor reconciles preparing state and uses CAS before another mutation.
export async function replaceTorrentPlayback(
  initial: TorrentSession,
  position: number,
  signal: AbortSignal,
  audioTrackRef = initial.playback?.selectedAudioTrackRef,
  retryUnavailable = true,
  onProgress?: (state: TorrentSessionState) => void,
  audioOnly = false,
): Promise<TorrentSession> {
  signal.throwIfAborted();
  if (!audioOnly && initial.media?.videoEndSeconds && supportsPreparedTorrentAudio(initial.media))
    position = Math.min(position, Math.max(0, initial.media.videoEndSeconds - 0.01));
  if (audioOnly && (initial.playback?.audioMode !== 'separate' || !audioTrackRef))
    throw new Error('Separate audio unavailable');
  const deadline = AbortSignal.any([AbortSignal.timeout(110_000), torrentAccountSignal()]);
  const key = newTorrentIdempotencyKey();
  let current = initial;
  let admittedVersion: number | null = null;
  let attempts = 0;
  let polls = 0;
  const audio = audioTrackRef;
  const outputProfile = initial.playback?.output?.profile ?? (await torrentOutputProfile());
  while (!deadline.aborted) {
    signal.throwIfAborted();
    if (current.selectedFileRef !== initial.selectedFileRef)
      throw new Error('Playback file replaced');
    if (admittedVersion === null && current.state !== 'preparing') {
      if (++attempts > 4) throw new Error('Playback admission failed');
      try {
        current = audioOnly
          ? await selectTorrentAudio(initial, position, audio!, current.version, key, deadline)
          : await startTorrentPlayback(
              initial.id,
              position,
              current.version,
              key,
              deadline,
              audio,
              outputProfile,
              initial.media,
            );
        admittedVersion = current.version;
      } catch (error) {
        signal.throwIfAborted();
        if (
          !(error instanceof TorrentRequestError) ||
          (!retryUnavailable && [429, 503].includes(error.status ?? 0)) ||
          !(
            error.kind === 'network' ||
            error.status === 409 ||
            [429, 502, 503, 504].includes(error.status ?? 0)
          )
        )
          throw error;
      }
      signal.throwIfAborted();
    }
    if (current.state !== 'ready') onProgress?.(current.state);
    if (admittedVersion !== null && current.state === 'ready') {
      if (
        !current.playback ||
        current.version < admittedVersion ||
        (!audioOnly && current.playback?.startPositionSeconds !== position) ||
        (audioOnly &&
          (current.playback?.generation !== initial.playback?.generation ||
            current.playback?.hlsUrl !== initial.playback?.hlsUrl ||
            current.playback?.timeline.absoluteAnchorSeconds !==
              initial.playback?.timeline.absoluteAnchorSeconds ||
            current.playback?.timeline.mediaAnchorSeconds !==
              initial.playback?.timeline.mediaAnchorSeconds)) ||
        (audio !== undefined && current.playback.selectedAudioTrackRef !== audio) ||
        (current.playback.output !== undefined &&
          current.playback.output.profile !== outputProfile) ||
        current.selectedFileRef !== initial.selectedFileRef
      )
        throw new Error('Playback generation replaced');
      signal.throwIfAborted();
      onProgress?.('ready');
      return current;
    }
    if (
      (admittedVersion !== null && current.failure) ||
      ['failed', 'awaiting_file'].includes(current.state) ||
      (admittedVersion !== null && current.state === 'awaiting_playback')
    )
      throw new Error('Playback preparation failed');
    // A short fast phase avoids extra startup delay without exhausting polling budgets.
    const polling = AbortSignal.any([deadline, signal]);
    await new Promise<void>((resolve, reject) => {
      const cancel = () => {
        clearTimeout(timer);
        reject(polling.reason);
      };
      const timer = setTimeout(
        () => {
          polling.removeEventListener('abort', cancel);
          resolve();
        },
        ++polls <= 12 ? 250 : 1_000,
      );
      polling.addEventListener('abort', cancel, { once: true });
      if (polling.aborted) cancel();
    });
    try {
      current = await getTorrentSession(initial.id, polling);
    } catch (error) {
      polling.throwIfAborted();
      if (
        !(error instanceof TorrentRequestError) ||
        !(error.kind === 'network' || [429, 502, 503, 504].includes(error.status ?? 0))
      )
        throw error;
    }
  }
  throw new Error('Playback preparation timed out');
}
