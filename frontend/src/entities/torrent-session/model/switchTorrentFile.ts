import {
  getTorrentSession,
  selectTorrentFile,
  TorrentRequestError,
} from '../api/torrentSessionApi';
import { preferredTorrentAudio } from './torrentAudioPreference';
import { torrentAccountSignal } from './torrentClientScope';
import { replaceTorrentPlayback } from './replaceTorrentPlayback';
import type { TorrentSession } from './torrentSession';

export async function switchTorrentFile(
  initial: TorrentSession,
  fileRef: string,
  position: number,
  caller: AbortSignal,
): Promise<TorrentSession> {
  const signal = AbortSignal.any([caller, torrentAccountSignal(), AbortSignal.timeout(110_000)]);
  let current = initial;
  let attempts = 0;
  let polls = 0;
  while (true) {
    signal.throwIfAborted();
    if (current.state === 'failed') throw new Error('Не удалось подготовить файл');
    if (
      current.selectedFileRef === fileRef &&
      ['awaiting_playback', 'ready'].includes(current.state)
    ) {
      const audio = preferredTorrentAudio(current.audioTracks);
      const duration = current.playback?.durationSeconds;
      return replaceTorrentPlayback(
        current,
        duration && position >= duration ? 0 : position,
        signal,
        audio?.ref,
        false,
      );
    }
    if (['awaiting_file', 'awaiting_playback', 'ready'].includes(current.state)) {
      if (++attempts > 4) throw new Error('Состояние торрента изменилось. Повторите выбор.');
      try {
        // Cancelling a request cannot undo admission. A successor reads the
        // current version before selecting another file after probing finishes.
        current = await selectTorrentFile(current.id, fileRef, current.version, signal);
        signal.throwIfAborted();
        continue;
      } catch (error) {
        signal.throwIfAborted();
        if (
          !(error instanceof TorrentRequestError) ||
          !(error.kind === 'network' || error.status === 409)
        )
          throw error;
      }
    }
    await new Promise<void>((resolve, reject) => {
      const cancel = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(
        () => {
          signal.removeEventListener('abort', cancel);
          resolve();
        },
        ++polls <= 12 ? 250 : 1_000,
      );
      signal.addEventListener('abort', cancel, { once: true });
      if (signal.aborted) cancel();
    });
    current = await getTorrentSession(initial.id, signal);
  }
}
