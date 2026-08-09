import { IconButton } from './IconButton';
import { CloseIcon } from './Icons';
import {
  useEffect,
  useId,
  useRef,
  type ComponentPropsWithoutRef,
  type SyntheticEvent,
} from 'react';

export type ModalProps = Omit<
  ComponentPropsWithoutRef<'dialog'>,
  'open' | 'onClose' | 'onCancel'
> & {
  open: boolean;
  onClose: () => void;
  title: string;
};

export function Modal({ open, onClose, title, children, className = '', ...props }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return;
    }

    if (open && !dialog.open) {
      dialog.showModal();
    }

    if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    onClose();
  }

  return (
    <dialog
      {...props}
      aria-labelledby={titleId}
      ref={dialogRef}
      onCancel={handleCancel}
      className={[
        'm-auto max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-lg',
        'overflow-y-auto rounded-overlay border border-border',
        'bg-surface-elevated p-6 text-text-primary shadow-overlay',
        'backdrop:bg-black/70 backdrop:backdrop-blur-sm',
        className,
      ].join(' ')}
    >
      <div className="flex items-center justify-between gap-4">
        <p id={titleId} className="text-heading text-text-primary">
          {title}
        </p>

        <IconButton aria-label="Закрыть" variant="ghost" size="small" onClick={onClose}>
          <CloseIcon className="size-5" />
        </IconButton>
      </div>
      <div className="items-center mt-5">{children}</div>
    </dialog>
  );
}
