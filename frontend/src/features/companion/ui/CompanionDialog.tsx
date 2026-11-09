import { useEffect, useId, useRef } from 'react';
import { Button, CloseIcon, IconButton } from '@/shared';
import { CheckIcon } from '@/shared/ui/Icons';
import type { CompanionConnection } from '../model/useCompanionConnection';
import { CompanionInstallation } from './CompanionInstallation';

export function CompanionDialog({
  connection,
  open,
  onClose,
}: {
  connection: CompanionConnection;
  open: boolean;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  const { state, connect, cancel, disconnect } = connection;
  const working = ['loading', 'connecting', 'pending', 'disconnecting'].includes(state.status);
  const close = () => {
    if (state.status === 'pending' || state.status === 'connecting') cancel();
    onClose();
  };
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={close}
      className="m-auto max-h-[calc(100dvh-2rem)] w-96 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-overlay border border-border bg-popover p-5 text-text-primary shadow-overlay backdrop:bg-black/50"
    >
      <section aria-label="Подключение yaneCompanion" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-body font-semibold">
            Локальный помощник
          </h2>
          <IconButton aria-label="Закрыть окно помощника" size="small" onClick={close}>
            <CloseIcon className="size-5" />
          </IconButton>
        </div>
        <p className="text-sm text-text-secondary">
          yaneCompanion работает на этом компьютере. Подключение доступно и без аккаунта.
        </p>
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="text-sm text-text-secondary"
        >
          {state.status === 'loading' && 'Проверяем сохранённое подключение…'}
          {state.status === 'idle' && 'Запустите yaneCompanion и нажмите «Подключить».'}
          {state.status === 'saved' &&
            'Доступ сохранён в этом браузере. Нажмите «Проверить подключение».'}
          {state.status === 'connecting' &&
            (state.hasPairing ? 'Проверяем подключение…' : 'Подключаемся к помощнику…')}
          {state.status === 'disconnecting' && 'Отключаем…'}
          {state.status === 'paired' && (
            <>
              <div className="rounded-control bg-success/10 px-3 py-2 text-success">
                <p className="flex items-center gap-2 font-medium">
                  <CheckIcon aria-hidden="true" className="size-4 shrink-0" />
                  Подключение проверено
                </p>
                {state.checkedAt && (
                  <p className="mt-1 text-xs">
                    Последняя проверка: {new Date(state.checkedAt).toLocaleTimeString('ru-RU')}
                  </p>
                )}
              </div>
              {!state.playbackReady && (
                <p className="mt-2">Эта версия пока не поддерживает локальный просмотр.</p>
              )}
            </>
          )}
          {state.status === 'pending' && (
            <>
              <p>
                Откройте окно yaneCompanion. Сверьте адрес этого сайта и код, затем подтвердите
                доступ.
              </p>
              <p className="mt-2 text-center text-2xl font-semibold tracking-widest text-text-primary">
                {state.code}
              </p>
              <p className="mt-2 break-all">{location.origin}</p>
            </>
          )}
        </div>
        {state.message && (
          <p role="alert" className="text-sm text-error">
            {state.message}
          </p>
        )}
        {!working && state.status !== 'paired' && <CompanionInstallation />}
        {state.status === 'pending' ? (
          <Button size="small" variant="secondary" onClick={close}>
            Отменить
          </Button>
        ) : (
          <>
            <Button
              size="small"
              disabled={working}
              aria-busy={state.status === 'connecting'}
              onClick={() => void connect()}
            >
              {state.status === 'connecting'
                ? 'Проверяем…'
                : state.hasPairing
                  ? 'Проверить подключение'
                  : 'Подключить'}
            </Button>
            {state.status === 'connecting' ? (
              <Button size="small" variant="secondary" onClick={close}>
                Отменить
              </Button>
            ) : state.hasPairing ? (
              <Button
                size="small"
                variant="secondary"
                disabled={working}
                onClick={() => void disconnect()}
              >
                Отключить и отозвать доступ
              </Button>
            ) : null}
          </>
        )}
      </section>
    </dialog>
  );
}
