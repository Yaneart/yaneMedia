import { CompanionError, companionRequest, hello, validPairingToken } from './companionClient';
import { pairingStorage } from '../model/pairingStorage';
import type { LocalAudio, LocalMediaSource } from '../model/localTracks';

export type CompanionLocator =
  { kind: 'magnet'; value: string } | { kind: 'metainfo'; base64: string };
export type LocalController = { token: string; bootId: string; capabilities?: string[] };
export type LocalTarget = {
  fileRef: string;
  audioRef: string;
  textRef: null;
  positionSeconds: number;
  output: string;
};
export type LocalSnapshot = {
  sessionId: string;
  revision: number;
  state:
    | 'metadata'
    | 'awaiting_file'
    | 'probing'
    | 'awaiting_target'
    | 'preparing'
    | 'ready'
    | 'stopping'
    | 'stopped'
    | 'failed';
  files: { fileRef: string; name: string; size: number }[];
  selectedFileRef?: string;
  downloadedBytes: number;
  error?: string;
  probe?: {
    durationSeconds: number;
    video: { contentType: string };
    audioTracks: LocalAudio[];
    outputs: string[];
  };
  target?: LocalTarget;
  source?: LocalMediaSource;
};
const id = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
const invalid = (): never => {
  throw new CompanionError('INVALID_RESPONSE');
};

export async function openLocalController(signal: AbortSignal): Promise<LocalController> {
  const handshake = await hello(signal);
  if (
    !handshake.capabilities.includes('torrent-admission.v1') ||
    !handshake.capabilities.includes('torrent-files.v1')
  )
    throw new CompanionError('INCOMPATIBLE_VERSION');
  const pairing = await pairingStorage.read();
  signal.throwIfAborted();
  if (!pairing) throw new CompanionError('PAIRING_REQUIRED');
  const result = await companionRequest('/v1/controllers', 'POST', signal, pairing);
  if (!id(result?.controllerId) || !validPairingToken(result?.controllerToken)) return invalid();
  return {
    token: result.controllerToken,
    bootId: handshake.bootId,
    capabilities: handshake.capabilities,
  };
}

export async function admitLocalTorrent(
  controller: LocalController,
  locator: CompanionLocator,
  key: string,
  signal: AbortSignal,
) {
  const result = await companionRequest(
    '/v1/sessions',
    'POST',
    signal,
    controller.token,
    { locator },
    key,
  );
  if (
    !id(result?.sessionId) ||
    result.operationId !== key ||
    result.revision !== 1 ||
    result.state !== 'metadata'
  )
    return invalid();
  return result.sessionId as string;
}
export async function localOperation(
  controller: LocalController,
  key: string,
  signal: AbortSignal,
): Promise<{ sessionId: string; revision: number; state: string; error?: string }> {
  const result = await companionRequest(`/v1/operations/${key}`, 'GET', signal, controller.token);
  if (
    !id(result?.sessionId) ||
    result.operationId !== key ||
    !['pending', 'ready', 'failed', 'cancelled'].includes(result.state)
  )
    return invalid();
  return result;
}
export async function localSnapshot(
  controller: LocalController,
  session: string,
  signal: AbortSignal,
): Promise<LocalSnapshot> {
  const value = await companionRequest(`/v1/sessions/${session}`, 'GET', signal, controller.token);
  if (
    value?.sessionId !== session ||
    !id(value.sessionId) ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    ![
      'metadata',
      'awaiting_file',
      'probing',
      'awaiting_target',
      'preparing',
      'ready',
      'stopping',
      'stopped',
      'failed',
    ].includes(value.state) ||
    !Array.isArray(value.files) ||
    value.files.length > 500 ||
    !Number.isSafeInteger(value.downloadedBytes) ||
    value.downloadedBytes < 0 ||
    value.downloadedBytes > 1024 ** 2 ||
    (value.selectedFileRef !== undefined && !id(value.selectedFileRef)) ||
    (value.error !== undefined && typeof value.error !== 'string')
  )
    return invalid();
  const seen = new Set<string>();
  for (const file of value.files) {
    if (
      !id(file?.fileRef) ||
      seen.has(file.fileRef) ||
      typeof file.name !== 'string' ||
      file.name.length > 4096 ||
      !Number.isSafeInteger(file.size) ||
      file.size < 0 ||
      file.size > 200 * 1024 ** 3
    )
      return invalid();
    seen.add(file.fileRef);
  }
  return value;
}
export async function selectLocalFile(
  controller: LocalController,
  session: LocalSnapshot,
  fileRef: string,
  key: string,
  signal: AbortSignal,
) {
  const value = await companionRequest(
    `/v1/sessions/${session.sessionId}/commands`,
    'POST',
    signal,
    controller.token,
    { action: 'select', expectedRevision: session.revision, fileRef },
    key,
  );
  if (
    value?.sessionId !== session.sessionId ||
    value.operationId !== key ||
    value.revision !== session.revision + 1
  )
    return invalid();
}
export const heartbeatLocalController = (controller: LocalController, signal: AbortSignal) =>
  companionRequest('/v1/controllers/current/heartbeat', 'POST', signal, controller.token);
export const closeLocalController = (controller: LocalController) =>
  companionRequest(
    '/v1/controllers/current',
    'DELETE',
    AbortSignal.timeout(5000),
    controller.token,
  );
