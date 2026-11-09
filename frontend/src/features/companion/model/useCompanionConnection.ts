import { useEffect, useRef, useState } from 'react';
import { resetTorrentClientScope } from '@/entities/torrent-session';
import {
  cancelPairing,
  checkPairing,
  CompanionError,
  createPairing,
  hello,
  pollPairing,
  revokePairing,
  type PairingRequest,
} from '../api/companionClient';
import { pairingStorage } from './pairingStorage';

type ConnectionState = {
  status:
    'loading' | 'idle' | 'saved' | 'connecting' | 'pending' | 'paired' | 'disconnecting' | 'error';
  hasPairing: boolean;
  code?: string;
  playbackReady?: boolean;
  checkedAt?: number;
  message?: string;
};

const messages: Record<string, string> = {
  PERMISSION_DENIED:
    'Разрешите этому сайту доступ к приложениям на устройстве в настройках браузера.',
  INCOMPATIBLE_VERSION:
    'Версия помощника несовместима. Обновите yaneCompanion и повторите подключение.',
  ORIGIN_DENIED: 'Этот адрес сайта не разрешён. Добавьте его локально в yaneCompanion.',
  HOST_DENIED: 'Помощник отклонил адрес подключения.',
  PAIRING_REQUIRED: 'Доступ отозван. Подключите помощник заново.',
  PAIRING_PENDING: 'В помощнике уже ожидает другой запрос. Подтвердите или отмените его.',
  RATE_LIMITED: 'Слишком много попыток. Подождите минуту и повторите подключение.',
  PAIRING_DENIED: 'Подключение отклонено в помощнике.',
  PAIRING_EXPIRED: 'Время подтверждения истекло. Подключите помощник заново.',
  PAIRING_STORAGE_UNAVAILABLE:
    'Браузер не разрешает сохранить доступ. Проверьте настройки хранилища.',
};

function errorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : '';
  return (
    messages[code] ?? 'Не удалось подключиться: проверьте запуск помощника и разрешение браузера.'
  );
}

function pause(signal: AbortSignal) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, 1_000);
    function abort() {
      clearTimeout(timer);
      reject(signal.reason);
    }
    signal.addEventListener('abort', abort, { once: true });
  });
}

export function useCompanionConnection() {
  const [state, setState] = useState<ConnectionState>({ status: 'loading', hasPairing: false });
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    void pairingStorage.read().then(
      (token) => {
        if (!cancelled) setState({ status: token ? 'saved' : 'idle', hasPairing: !!token });
      },
      () => {
        if (!cancelled) {
          setState({
            status: 'error',
            hasPairing: false,
            message: messages.PAIRING_STORAGE_UNAVAILABLE,
          });
        }
      },
    );
    return () => {
      cancelled = true;
      mounted.current = false;
      active.current?.abort();
    };
  }, []);

  const connect = async () => {
    if (active.current || state.status === 'loading') return;
    const controller = new AbortController();
    active.current = controller;
    const { signal } = controller;
    let pending: PairingRequest | undefined;
    let written = false;
    let success = false;
    let hasPairing = state.hasPairing;
    let next: ConnectionState = { status: 'idle', hasPairing };
    setState({ status: 'connecting', hasPairing });
    try {
      const handshake = await hello(signal);
      const token = await pairingStorage.read();
      hasPairing = !!token;
      signal.throwIfAborted();
      if (token) {
        try {
          await checkPairing(token, signal);
          success = true;
        } catch (error) {
          if (!(error instanceof CompanionError) || error.code !== 'PAIRING_REQUIRED') throw error;
          await pairingStorage.clear();
          hasPairing = false;
        }
      }
      if (!success) {
        signal.throwIfAborted();
        // Retain the create response proof so cancellation can also close a raced request.
        pending = await createPairing(AbortSignal.timeout(5_000));
        signal.throwIfAborted();
        setState({ status: 'pending', hasPairing: false, code: pending.code });
        while (Date.now() < Date.parse(pending.expiresAt)) {
          const result = await pollPairing(pending, signal);
          signal.throwIfAborted();
          if (result.state === 'approved') {
            await pairingStorage.write(result.pairingToken!);
            written = true;
            signal.throwIfAborted();
            success = true;
            break;
          }
          if (result.state !== 'pending') {
            throw new CompanionError(
              result.state === 'denied' ? 'PAIRING_DENIED' : 'PAIRING_EXPIRED',
            );
          }
          await pause(signal);
        }
        if (!success) throw new CompanionError('PAIRING_EXPIRED');
      }
      signal.throwIfAborted();
      next = {
        status: 'paired',
        hasPairing: true,
        checkedAt: Date.now(),
        playbackReady: ['sessions.v1', 'hls.mse', 'timeline.windowed-vod'].every((capability) =>
          handshake.capabilities.includes(capability),
        ),
      };
    } catch (error) {
      success = false;
      next = signal.aborted
        ? { status: hasPairing ? 'saved' : 'idle', hasPairing }
        : { status: 'error', hasPairing, message: errorMessage(error) };
    } finally {
      if (!success && pending) {
        await cancelPairing(pending).catch(() => undefined);
        if (written) await pairingStorage.clear().catch(() => undefined);
      }
      active.current = null;
      if (mounted.current) setState(next);
    }
  };

  const cancel = () => {
    if (!active.current) return;
    setState((previous) => ({ ...previous, status: 'disconnecting' }));
    active.current.abort();
  };

  const disconnect = async () => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setState({ status: 'disconnecting', hasPairing: true });
    try {
      const token = await pairingStorage.read();
      if (token) {
        try {
          await revokePairing(token, controller.signal);
        } catch (error) {
          if (!(error instanceof CompanionError) || error.code !== 'PAIRING_REQUIRED') throw error;
        }
      }
      resetTorrentClientScope();
      await pairingStorage.clear();
      if (mounted.current) setState({ status: 'idle', hasPairing: false });
    } catch (error) {
      if (mounted.current) {
        setState({ status: 'error', hasPairing: true, message: errorMessage(error) });
      }
    } finally {
      active.current = null;
    }
  };

  return { state, connect, cancel, disconnect };
}

export type CompanionConnection = ReturnType<typeof useCompanionConnection>;
