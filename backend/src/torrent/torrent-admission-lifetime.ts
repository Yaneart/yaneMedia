import type { Response } from 'express';

// A disconnected create request cannot leave a newly admitted torrent running.
// Keep watching until Express finishes sending the response, including the gap
// between admission and serialization. Normal completed responses keep ownership.
export function stopDisconnectedTorrent<T extends { sessionId: string }>(
  response: Response,
  admission: Promise<T>,
  stop: (sessionId: string) => Promise<void>,
): Promise<T> {
  let session: T | undefined;
  let disconnected = false;
  let discarded = false;
  const dispose = () => {
    response.off('close', close);
    response.off('finish', dispose);
  };
  const discard = (value: T) => {
    dispose();
    if (discarded) return;
    discarded = true;
    void stop(value.sessionId).catch(() => undefined);
  };
  const close = () => {
    dispose();
    if (response.writableFinished) return;
    disconnected = true;
    if (session) discard(session);
  };
  response.once('close', close);
  response.once('finish', dispose);
  return admission.then(
    (value) => {
      session = value;
      if (disconnected || (response.destroyed && !response.writableFinished)) discard(value);
      return value;
    },
    (error: unknown) => {
      dispose();
      throw error;
    },
  );
}
