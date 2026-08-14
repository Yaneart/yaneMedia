import { useId, type ComponentPropsWithRef, type ReactNode } from 'react';

export type InputProps = ComponentPropsWithRef<'input'> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
};

export function Input({
  id,
  label,
  hint,
  error,
  className = '',
  'aria-describedby': ariaDescribedBy,
  ...props
}: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const message = error ?? hint;
  const messageId = message ? `${inputId}-message` : undefined;
  const describedBy = [ariaDescribedBy, messageId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex w-full flex-col gap-2">
      {label && (
        <label className="text-sm font-medium text-text-primary" htmlFor={inputId}>
          {label}
        </label>
      )}

      <input
        {...props}
        id={inputId}
        className={[
          'min-h-11 w-full rounded-control border bg-surface px-3',
          'text-sm text-text-primary placeholder:text-text-secondary',
          'transition-[background-color,border-color,box-shadow] duration-200 ease-out',
          'hover:bg-surface-elevated focus:bg-surface-elevated',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20',
          'motion-reduce:transition-none',
          'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
          error
            ? 'border-error hover:border-error focus:border-error'
            : 'border-border hover:border-text-secondary focus:border-text-secondary',
          className,
        ].join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />

      {message && (
        <p
          id={messageId}
          className={['text-caption', error ? 'text-error' : 'text-text-secondary'].join(' ')}
        >
          {message}
        </p>
      )}
    </div>
  );
}
