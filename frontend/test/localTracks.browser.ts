import '@yaneart/yaneplayer';
import type { HostCommand, HostContext, HostResult, YanePlayerElement } from '@yaneart/yaneplayer';
import {
  companionRequest,
  createPairing,
  pollPairing,
} from '../src/features/companion/api/companionClient';
import {
  localTrackSource,
  createLocalTrackStream,
  type LocalMediaSource,
} from '../src/features/companion/model/localTracks';

type Snapshot = {
  sessionId: string;
  revision: number;
  state: string;
  error?: string;
  selectedFileRef: string;
  files: { fileRef: string; name: string }[];
  probe: { video: { contentType: string }; audioTracks: { audioRef: string }[] };
  target: {
    fileRef: string;
    audioRef: string;
    textRef: string | null;
    positionSeconds: number;
    output: string;
  };
  source: LocalMediaSource;
};
const status = document.querySelector('output')!;
const show = (value: string) => {
  status.textContent = value;
};
const delay = () => new Promise((resolve) => setTimeout(resolve, 1000));
let token = '';
let session = '';
let current: Snapshot;
let serial: Promise<unknown> = Promise.resolve();
const lifetime = new AbortController();
const request = (path: string, method = 'GET', body?: unknown, key?: string) =>
  companionRequest(path, method, AbortSignal.timeout(15_000), token, body, key);
const snapshot = async () => (current = (await request(`/v1/sessions/${session}`)) as Snapshot);
const player = document.createElement('yane-player') as YanePlayerElement;
const stream = createLocalTrackStream(player, async (source, position, signal) => {
  await companionRequest(`/v1/sessions/${session}/progress`, 'POST', signal, token, {
    sourceRevision: source.revision,
    positionSeconds: position,
  });
});
player.commandTimeoutMs = 120_000;
player.lang = 'ru';
document.querySelector('#player')!.append(player);
player.addEventListener('yp-statechange', ((event: CustomEvent) =>
  stream.update(event.detail.snapshot)) as EventListener);
player.addEventListener('yp-positionchange', ((event: CustomEvent) =>
  stream.update(event.detail.snapshot)) as EventListener);
player.addEventListener('yp-error', ((event: CustomEvent) =>
  show(`Ошибка плеера: ${JSON.stringify(event.detail.snapshot.error)}`)) as EventListener);

async function command(body: object, signal = lifetime.signal) {
  const key = crypto.randomUUID();
  const admission = await request(
    `/v1/sessions/${session}/commands`,
    'POST',
    { ...body, expectedRevision: current.revision },
    key,
  );
  const end = Date.now() + 120_000;
  while (Date.now() < end) {
    const operation = await request(`/v1/operations/${key}`);
    if (signal.aborted) {
      if (operation.state === 'pending') {
        const response = await fetch(`http://127.0.0.1:45723/v1/operations/${key}`, {
          method: 'DELETE',
          credentials: 'omit',
          redirect: 'error',
          headers: { Authorization: `Bearer ${token}`, 'If-Match': String(admission.revision) },
        });
        if (!response.ok && response.status !== 409) throw new Error('Cancel failed');
      }
      await snapshot();
      // Cancellation publication precedes worker teardown; give the bounded
      // worker lane time to settle before the next serialized configure.
      await delay();
      signal.throwIfAborted();
    }
    if (operation.state === 'ready') {
      await snapshot();
      return;
    }
    if (operation.state !== 'pending') throw new Error(operation.error ?? operation.state);
    await delay();
  }
  throw new Error('Preparation deadline');
}

async function execute(commandValue: HostCommand, context: HostContext): Promise<HostResult> {
  context.signal.throwIfAborted();
  await snapshot();
  if (commandValue.type !== 'audio' && commandValue.type !== 'seek')
    throw new Error('Unsupported host command');
  const target = {
    ...current.target,
    positionSeconds: commandValue.target.positionSeconds ?? context.positionSeconds ?? 0,
    audioRef: commandValue.target.audioId ?? current.target.audioRef,
    textRef: null,
  };
  await command({ action: 'configure', target, clientMedia: clientMedia() }, context.signal);
  context.signal.throwIfAborted();
  stream.configure(current.source);
  return {
    source: localTrackSource(current.source),
    selection: { audioId: current.target.audioRef },
  };
}
player.host = {
  execute(c, context) {
    const result = serial.catch(() => {}).then(() => execute(c, context));
    serial = result;
    return result;
  },
};
const clientMedia = () =>
  [current.probe.video.contentType, 'audio/mp4; codecs="mp4a.40.2"'].map((contentType) => ({
    contentType,
    supported: MediaSource.isTypeSupported(contentType),
  }));
const guard = (run: () => Promise<void>) => () => {
  void run().catch((error) => show(String(error)));
};

document.querySelector('#pair')!.addEventListener(
  'click',
  guard(async () => {
    const pairing = await createPairing(lifetime.signal);
    show(`Подтвердите код ${pairing.code} в локальном окне помощника.`);
    while (!lifetime.signal.aborted) {
      const result = await pollPairing(pairing, lifetime.signal);
      if (result.state === 'approved') {
        const controller = await companionRequest(
          '/v1/controllers',
          'POST',
          lifetime.signal,
          result.pairingToken,
        );
        token = controller.controllerToken;
        show('Подключено. Можно открыть тестовый MKV.');
        return;
      }
      if (result.state !== 'pending') throw new Error(result.state);
      await delay();
    }
  }),
);
document.querySelector('#start')!.addEventListener(
  'click',
  guard(async () => {
    const admitted = await request(
      '/v1/sessions',
      'POST',
      { locator: { kind: 'magnet', value: `magnet:?xt=urn:btih:${'a'.repeat(40)}` } },
      crypto.randomUUID(),
    );
    session = admitted.sessionId;
    while ((await snapshot()).state === 'metadata') await delay();
    const file = current.files.find((f) => f.name === 'episode.mkv')!;
    await command({ action: 'probe', fileRef: file.fileRef });
    await command({
      action: 'configure',
      target: {
        fileRef: file.fileRef,
        audioRef: current.probe.audioTracks[0].audioRef,
        textRef: null,
        positionSeconds: 0,
        output: 'original',
      },
      clientMedia: clientMedia(),
    });
    stream.configure(current.source);
    await player.setSource(localTrackSource(current.source), {
      positionSeconds: 0,
      intent: 'paused',
    });
    show(
      'Готово: Tone 440 / Tone 880; встроенные SRT, ASS и внешний SRT. Off, оформление и задержка — в меню плеера.',
    );
  }),
);
document.querySelector('#stop')!.addEventListener(
  'click',
  guard(async () => {
    stream.dispose();
    await request('/v1/controllers/current', 'DELETE');
    token = '';
    show('Остановлено; доступ отозван.');
  }),
);
setInterval(() => {
  if (token) void request('/v1/controllers/current/heartbeat', 'POST').catch(() => {});
}, 20_000);
window.addEventListener('pagehide', () => {
  lifetime.abort();
  stream.dispose();
});
Object.assign(window, { lc007: { player, snapshot, source: () => current?.source } });
