import { useEffect, useId, useRef, type MouseEvent } from 'react';
import { Button, CloseIcon, IconButton } from '@/shared';
import { CheckIcon } from '@/shared/ui/Icons';
import ExternalLinkIcon from '@mingcute/react/core-regular/external-link';
import type { CompanionConnection } from '../model/useCompanionConnection';
import { CompanionInstallation } from './CompanionInstallation';
import { MIN_COMPANION_VERSION } from '../api/companionClient';

function isBackdropClick(event: MouseEvent<HTMLDialogElement>) {
  if (event.target !== event.currentTarget) return false;
  const { left, top, right, bottom } = event.currentTarget.getBoundingClientRect();
  return (
    event.clientX < left || event.clientX >= right || event.clientY < top || event.clientY >= bottom
  );
}

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
  const pressedBackdrop = useRef(false);
  const titleId = useId();
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);
  const { state, connect, cancel, disconnect } = connection;
  const working = ['loading', 'connecting', 'pending', 'disconnecting'].includes(state.status);
  const showSetup = !working && state.status !== 'paired';
  const close = () => {
    if (state.status === 'pending' || state.status === 'connecting') cancel();
    onClose();
  };
  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={close}
      onPointerDown={(event) => {
        pressedBackdrop.current = isBackdropClick(event);
      }}
      onClick={(event) => {
        const dismiss = pressedBackdrop.current && isBackdropClick(event);
        pressedBackdrop.current = false;
        if (dismiss) event.currentTarget.close();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[31rem] max-w-[calc(100vw-2rem)] overflow-y-auto rounded-overlay border border-border bg-popover p-4 text-text-primary shadow-overlay backdrop:bg-black/50 sm:p-5"
    >
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <h2 id={titleId} className="text-lg font-semibold">
            yaneCompanion
          </h2>
          <IconButton aria-label="Закрыть окно помощника" size="small" onClick={close}>
            <CloseIcon className="size-5" />
          </IconButton>
        </div>
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="text-sm text-text-secondary empty:hidden"
        >
          {state.status === 'loading' && 'Проверяем сохранённое подключение…'}
          {state.status === 'idle' && 'Подключите yaneCompanion для просмотра торрентов.'}
          {state.status === 'saved' && 'Доступ к yaneCompanion сохранён в этом браузере.'}
          {state.status === 'connecting' &&
            (state.hasPairing ? 'Проверяем подключение…' : 'Подключаемся к помощнику…')}
          {state.status === 'disconnecting' && 'Отключаем…'}
          {state.status === 'paired' && (
            <>
              <div className="rounded-control bg-success/10 px-3 py-2 text-success">
                <p className="flex items-center gap-2 font-medium">
                  <CheckIcon aria-hidden="true" className="size-4 shrink-0" />
                  yaneCompanion подключён
                </p>
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
        {state.updateRequired && (
          <p className="text-sm text-text-secondary">
            Требуется версия {MIN_COMPANION_VERSION} или новее. Проверьте обновления в разделе
            «Поддержка» приложения или скачайте установщик.
          </p>
        )}
        {state.status === 'pending' ? (
          <Button size="small" variant="secondary" onClick={close}>
            Отменить
          </Button>
        ) : (
          <>
            <Button
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
            ) : null}
          </>
        )}
        {!working && (
          <a
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-control border border-border bg-control px-3 text-sm font-semibold hover:bg-control-hover focus-visible:outline-2 focus-visible:outline-watermark"
            href="yanecompanion://open"
          >
            <ExternalLinkIcon aria-hidden="true" className="size-4 text-accent-text" />
            Открыть yaneCompanion
          </a>
        )}
        {showSetup && <CompanionInstallation />}
        {state.hasPairing && state.status !== 'connecting' && (
          <Button size="small" variant="ghost" disabled={working} onClick={() => void disconnect()}>
            Отключить и отозвать доступ
          </Button>
        )}
      </section>
    </dialog>
  );
}
