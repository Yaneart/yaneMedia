import type { HostCommand, HostContext } from '@yaneart/yaneplayer';
import { CompanionError, companionRequest } from '../api/companionClient';
import {
  localOperation,
  localSnapshot,
  type LocalController,
  type LocalSnapshot,
} from '../api/companionAdmission';
import { localTrackSource, type LocalMediaSource } from './localTracks';

export type LocalPlayback = {
  source: LocalMediaSource;
  audioId: string;
  position: number;
  execute: (
    command: HostCommand,
    context: HostContext,
  ) => Promise<{ source?: LocalMediaSource; audioId: string }>;
  report: (source: LocalMediaSource, position: number, signal: AbortSignal) => Promise<unknown>;
};

const pause = (signal: AbortSignal, ms = 250) =>
  new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });

// One queue owns revisions and cancellation acknowledgements for this controller.
// A cancelled POST is reconciled by its key, never submitted a second time.
export function createLocalPlayback(
  controller: LocalController,
  session: string,
  lifetime: AbortSignal,
) {
  let serial: Promise<unknown> = Promise.resolve();
  const request = (
    path: string,
    method: string,
    signal: AbortSignal,
    body?: unknown,
    key?: string,
    headers?: Record<string, string>,
  ) => companionRequest(path, method, signal, controller.token, body, key, headers);
  const read = (signal: AbortSignal) => localSnapshot(controller, session, signal);
  async function command(body: object, signal: AbortSignal): Promise<LocalSnapshot> {
    let state = await read(signal);
    const key = crypto.randomUUID();
    let accepted = false;
    try {
      // After cancel the helper publishes its revision before its worker exits.
      // A bounded retry only handles that CAS conflict; no command was admitted.
      for (let attempt = 0; ; attempt++) {
        signal.throwIfAborted();
        try {
          const result = await request(
            `/v1/sessions/${session}/commands`,
            'POST',
            signal,
            { ...body, expectedRevision: state.revision },
            key,
          );
          if (
            result?.operationId !== key ||
            result.sessionId !== session ||
            result.revision !== state.revision + 1
          )
            throw new CompanionError('INVALID_RESPONSE');
          accepted = true;
          break;
        } catch (error) {
          if (signal.aborted) throw error;
          if (error instanceof CompanionError && error.code === 'UNAVAILABLE') {
            // The server may have admitted a request whose response was lost.
            await localOperation(controller, key, signal);
            accepted = true;
            break;
          }
          if (
            !(error instanceof CompanionError) ||
            error.code !== 'REVISION_CONFLICT' ||
            attempt >= 12
          )
            throw error;
          await pause(signal);
          state = await read(signal);
        }
      }
      while (true) {
        const operation = await localOperation(controller, key, signal);
        if (operation.sessionId !== session) throw new CompanionError('INVALID_RESPONSE');
        if (operation.state === 'ready') return await read(signal);
        if (operation.state !== 'pending')
          throw new CompanionError(operation.error ?? 'MEDIA_FAILED');
        await pause(signal);
      }
    } catch (error) {
      if (signal.aborted && !lifetime.aborted) {
        // Independent cleanup must finish before the next queued command.
        const cleanup = AbortSignal.any([lifetime, AbortSignal.timeout(5000)]);
        const operation = await localOperation(controller, key, cleanup).catch(() => null);
        if (operation?.sessionId === session && operation.state === 'pending')
          await request(`/v1/operations/${key}`, 'DELETE', cleanup, undefined, undefined, {
            'If-Match': String(operation.revision),
          });
        else if (accepted && !operation) throw new CompanionError('UNAVAILABLE');
      }
      throw error;
    }
  }
  function queued<T>(signal: AbortSignal, run: (signal: AbortSignal) => Promise<T>) {
    const combined = AbortSignal.any([lifetime, signal, AbortSignal.timeout(125_000)]);
    const result = serial
      .catch(() => {})
      .then(() => {
        combined.throwIfAborted();
        return run(combined);
      });
    serial = result;
    return result;
  }
  async function configure(
    state: LocalSnapshot,
    position: number,
    signal: AbortSignal,
    audioId?: string,
  ) {
    const probe = state.probe;
    if (
      !probe ||
      !state.selectedFileRef ||
      !Array.isArray(probe.audioTracks) ||
      !Array.isArray(probe.outputs)
    )
      throw new CompanionError('INVALID_RESPONSE');
    const audio =
      probe.audioTracks.find((a) => a.audioRef === audioId) ??
      probe.audioTracks.find((a) => a.default) ??
      probe.audioTracks[0];
    if (!audio || !Number.isFinite(position) || position < 0)
      throw new CompanionError('UNSUPPORTED_MEDIA');
    const contentTypes = [probe.video?.contentType, 'audio/mp4; codecs="mp4a.40.2"'];
    if (
      !contentTypes[0] ||
      !probe.outputs.includes('original') ||
      typeof MediaSource === 'undefined' ||
      !contentTypes.every((type) => MediaSource.isTypeSupported(type))
    )
      throw new CompanionError('UNSUPPORTED_MEDIA');
    const ready = await command(
      {
        action: 'configure',
        target: {
          fileRef: state.selectedFileRef,
          audioRef: audio.audioRef,
          textRef: null,
          positionSeconds: Math.min(position, Math.max(0, probe.durationSeconds - 0.01)),
          output: 'original',
        },
        clientMedia: contentTypes.map((contentType) => ({ contentType, supported: true })),
      },
      signal,
    );
    signal.throwIfAborted();
    if (ready.state !== 'ready' || !ready.source || !ready.target)
      throw new CompanionError('INVALID_RESPONSE');
    localTrackSource(ready.source);
    return ready as LocalSnapshot & {
      source: LocalMediaSource;
      target: NonNullable<LocalSnapshot['target']>;
    };
  }
  const execute: LocalPlayback['execute'] = (commandValue, context) => {
    return queued(context.signal, async (signal) => {
      if (commandValue.type !== 'seek' && commandValue.type !== 'audio')
        throw new CompanionError('UNSUPPORTED_CAPABILITY');
      const state = await read(signal);
      const audioId = commandValue.target.audioId ?? state.target?.audioRef;
      if (
        commandValue.type === 'audio' &&
        audioId &&
        audioId === state.target?.audioRef &&
        state.source
      )
        return { audioId };
      const ready = await configure(
        state,
        commandValue.target.positionSeconds ?? context.positionSeconds ?? 0,
        signal,
        audioId,
      );
      return { source: ready.source, audioId: ready.target.audioRef };
    });
  };
  return {
    prepare(fileRef: string, position: number, signal: AbortSignal) {
      return queued(signal, async (active) => {
        const capabilities = [
          'sessions.v1',
          'hls.mse',
          'timeline.windowed-vod',
          'video.original',
          'audio.aac',
          'audio.select',
          'text.prepared',
        ];
        if (!capabilities.every((c) => controller.capabilities?.includes(c)))
          throw new CompanionError('INCOMPATIBLE_VERSION');
        const previous = await read(active);
        const selected = previous.probe?.audioTracks.find(
          (a) => a.audioRef === previous.target?.audioRef,
        );
        const probed = await command({ action: 'probe', fileRef }, active);
        const audio =
          selected &&
          probed.probe?.audioTracks.find(
            (a) => a.label === selected.label && a.language === selected.language,
          );
        const ready = await configure(probed, position, active, audio?.audioRef);
        const playback: LocalPlayback = {
          source: ready.source,
          audioId: ready.target.audioRef,
          position: ready.target.positionSeconds,
          execute,
          report: (source, positionSeconds, signal) =>
            request(
              `/v1/sessions/${session}/progress`,
              'POST',
              AbortSignal.any([lifetime, signal]),
              { sourceRevision: source.revision, positionSeconds },
            ),
        };
        return { snapshot: ready, playback };
      });
    },
  };
}
