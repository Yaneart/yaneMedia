import { useEffect, useRef, useState } from 'react';
import { registerTorrentPlayerStop, torrentAccountSignal } from '@/entities/torrent-session';
import {
  openLocalController,
  admitLocalTorrent,
  localOperation,
  localSnapshot,
  selectLocalFile,
  heartbeatLocalController,
  closeLocalController,
  CompanionError,
  type CompanionLocator,
  type LocalController,
  type LocalSnapshot,
  createLocalPlayback,
  type LocalPlayback,
} from '@/features/companion';

export function localTorrentError(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  const messages: Record<string, string> = {
    PAIRING_REQUIRED: 'Подключите локальный помощник, затем повторите выбор раздачи.',
    CONTROLLER_REQUIRED: 'Доступ к локальной сессии истёк. Повторите выбор раздачи.',
    INCOMPATIBLE_VERSION: 'Обновите помощник: эта версия не поддерживает локальный просмотр.',
    DEVICE_BUSY: 'На этом компьютере уже открыта раздача. Остановите её в прежней вкладке.',
    UNSAFE_LOCATOR: 'Раздача содержит неподдерживаемые или небезопасные данные. Выберите другую.',
    NO_PEERS:
      'Не удалось получить данные от участников раздачи. Повторите попытку или выберите другую.',
    ENGINE_UNAVAILABLE:
      'Локальная загрузка прервалась. Повторите попытку или выберите другую раздачу.',
    PERMISSION_DENIED: 'Разрешите сайту доступ к приложениям на устройстве в настройках браузера.',
    REVISION_CONFLICT: 'Состояние раздачи изменилось. Повторите выбор файла.',
    INPUT_TOO_LARGE: 'Файл .torrent не должен превышать 2 Мб.',
    TORRENT_CANDIDATE_NOT_FOUND:
      'Результат поиска устарел. Обновите поиск и выберите раздачу заново.',
    UNSUPPORTED_MEDIA: 'Этот видеофайл не поддерживается браузером. Выберите другой файл.',
    UNSUPPORTED_CAPABILITY: 'Обновите помощник: эта функция пока недоступна.',
    MEDIA_FAILED:
      'Не удалось подготовить видео. Повторите выбор файла или выберите другую раздачу.',
    RESOURCE_LIMIT: 'Для этого файла недостаточно ресурсов. Выберите другой файл.',
  };
  const apiCode = (error as { code?: string } | null)?.code;
  return (
    messages[apiCode ?? code] ??
    'Не удалось загрузить раздачу. Проверьте запуск помощника и повторите попытку.'
  );
}

const pause = (signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, 1000);
    function abort() {
      clearTimeout(timer);
      reject(signal.reason);
    }
    signal.addEventListener('abort', abort, { once: true });
  });

export function useLocalTorrent() {
  const [playback, setPlayback] = useState<LocalPlayback | null>(null);
  const [snapshot, setSnapshot] = useState<LocalSnapshot | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = useRef<{
    controller: LocalController;
    signal: AbortController;
    session?: string;
    media?: ReturnType<typeof createLocalPlayback>;
  } | null>(null);
  const selection = useRef(false);
  const opening = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const closing = useRef<Promise<unknown>>(Promise.resolve());
  const preparing = useRef<AbortController | null>(null);

  function dispose() {
    preparing.current?.abort();
    preparing.current = null;
    opening.current?.abort();
    opening.current = null;
    const previous = current.current;
    current.current = null;
    previous?.signal.abort();
    if (previous)
      closing.current = closeLocalController(previous.controller).catch(() => undefined);
  }
  useEffect(() => {
    mounted.current = true;
    const stop = () => {
      dispose();
      setSnapshot(null);
      setPlayback(null);
      setPending(false);
    };
    const unregister = registerTorrentPlayerStop(stop);
    window.addEventListener('pagehide', stop);
    return () => {
      mounted.current = false;
      unregister();
      window.removeEventListener('pagehide', stop);
      dispose();
    };
  }, []);

  const start = async (resolve: (signal: AbortSignal) => Promise<CompanionLocator>) => {
    if (selection.current) return;
    selection.current = true;
    dispose();
    setSnapshot(null);
    setPlayback(null);
    setPending(true);
    setError(null);
    const abort = new AbortController();
    opening.current = abort;
    const signal = AbortSignal.any([abort.signal, torrentAccountSignal()]);
    let active: NonNullable<typeof current.current> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    try {
      await closing.current;
      signal.throwIfAborted();
      const controller = await openLocalController(signal);
      if (signal.aborted) {
        void closeLocalController(controller).catch(() => undefined);
        signal.throwIfAborted();
      }
      active = { controller, signal: abort };
      current.current = active;
      // Keep the lease independently of metadata polling and open UI menus.
      heartbeat = setInterval(() => {
        void heartbeatLocalController(controller, signal).catch((cause) => {
          if (!signal.aborted && mounted.current) {
            setError(localTorrentError(cause));
            dispose();
            setSnapshot(null);
            setPlayback(null);
            setPending(false);
          }
        });
      }, 20_000);
      const locator = await resolve(signal);
      signal.throwIfAborted();
      const key = crypto.randomUUID();
      try {
        active.session = await admitLocalTorrent(controller, locator, key, signal);
      } catch (cause) {
        if (signal.aborted || !(cause instanceof CompanionError) || cause.code !== 'UNAVAILABLE')
          throw cause;
        // Read the original operation after a lost POST response; never create twice.
        for (let attempt = 0; attempt < 3; attempt++) {
          await pause(signal);
          try {
            active.session = (await localOperation(controller, key, signal)).sessionId;
            break;
          } catch (readError) {
            if (
              !(readError instanceof CompanionError) ||
              readError.code !== 'NOT_FOUND' ||
              attempt === 2
            )
              throw readError;
          }
        }
      }
      if (!active.session) throw new CompanionError('UNAVAILABLE');
      active.media = createLocalPlayback(controller, active.session, signal);
      selection.current = false;
      let lastRevision = 0;
      while (!signal.aborted) {
        const state = await localSnapshot(controller, active.session, signal);
        signal.throwIfAborted();
        if (current.current !== active) break;
        if (state.revision < lastRevision) throw new CompanionError('INVALID_RESPONSE');
        lastRevision = state.revision;
        setSnapshot(state);
        setPending(state.state === 'metadata' || selection.current);
        if (state.error) setError(localTorrentError(new CompanionError(state.error)));
        if (state.state === 'failed' || state.state === 'stopped') break;
        if (state.state === 'awaiting_file') {
          // File choices refresh their own operation/snapshot. An idle picker
          // only needs its controller heartbeat, not continuous polling.
          await new Promise<void>((resolve) => {
            if (signal.aborted) resolve();
            else signal.addEventListener('abort', () => resolve(), { once: true });
          });
          break;
        }
        await pause(signal);
      }
    } catch (cause) {
      if (!signal.aborted && mounted.current) {
        setError(localTorrentError(cause));
        setPending(false);
      }
    } finally {
      selection.current = false;
      clearInterval(heartbeat);
      if (active && current.current === active) {
        dispose();
        if (mounted.current) setSnapshot(null);
      }
    }
  };

  const select = async (fileRef: string) => {
    const active = current.current;
    if (!active || !snapshot || selection.current) return;
    selection.current = true;
    setPending(true);
    setError(null);
    const signal = AbortSignal.any([active.signal.signal, torrentAccountSignal()]);
    const key = crypto.randomUUID();
    try {
      try {
        await selectLocalFile(active.controller, snapshot, fileRef, key, signal);
      } catch (cause) {
        if (signal.aborted || !(cause instanceof CompanionError) || cause.code !== 'UNAVAILABLE')
          throw cause;
        await localOperation(active.controller, key, signal);
      }
      while (!signal.aborted) {
        await pause(signal);
        const operation = await localOperation(active.controller, key, signal);
        if (operation.state === 'pending') continue;
        if (operation.state !== 'ready') throw new CompanionError(operation.error ?? 'UNAVAILABLE');
        const state = await localSnapshot(active.controller, snapshot.sessionId, signal);
        signal.throwIfAborted();
        if (current.current === active) setSnapshot(state);
        break;
      }
    } catch (cause) {
      if (!signal.aborted && mounted.current && current.current === active) {
        const fresh = await localSnapshot(active.controller, snapshot.sessionId, signal).catch(
          () => null,
        );
        if (!signal.aborted && current.current === active) {
          if (fresh) setSnapshot(fresh);
          else {
            dispose();
            setSnapshot(null);
            setPending(false);
          }
          setError(localTorrentError(cause));
        }
      }
    } finally {
      selection.current = false;
      if (mounted.current && current.current === active) setPending(false);
    }
  };
  const prepare = async (fileRef: string, position = 0, hostSignal?: AbortSignal) => {
    const active = current.current;
    if (!active?.media) throw new CompanionError('CONTROLLER_REQUIRED');
    preparing.current?.abort();
    const job = new AbortController();
    preparing.current = job;
    const signal = AbortSignal.any([
      job.signal,
      active.signal.signal,
      torrentAccountSignal(),
      ...(hostSignal ? [hostSignal] : []),
    ]);
    setPending(true);
    setError(null);
    // Old read grants are revoked as soon as probe starts. Keep the player
    // mounted while navigation is pending, but suppress its stale callbacks.
    try {
      const ready = await active.media.prepare(fileRef, position, signal);
      signal.throwIfAborted();
      if (current.current !== active || preparing.current !== job) return;
      setSnapshot(ready.snapshot);
      setPlayback(ready.playback);
      return ready.playback;
    } catch (cause) {
      if (
        !signal.aborted &&
        mounted.current &&
        current.current === active &&
        preparing.current === job
      ) {
        setError(localTorrentError(cause));
        setPlayback(null);
        const fresh = await localSnapshot(active.controller, active.session!, signal).catch(
          () => null,
        );
        if (!signal.aborted && current.current === active && preparing.current === job) {
          setSnapshot(fresh);
          if (!fresh) {
            setPending(false);
            dispose();
          }
        }
      }
      throw cause;
    } finally {
      if (preparing.current === job) {
        preparing.current = null;
        if (mounted.current && current.current === active) setPending(false);
      }
    }
  };
  return {
    playback,
    snapshot,
    pending,
    error,
    start,
    select,
    prepare,
    stop: () => {
      dispose();
      setSnapshot(null);
      setPlayback(null);
      setPending(false);
      setError(null);
    },
  };
}
