import { useId, type ComponentPropsWithRef, type ReactNode } from 'react';

export type InputVariant = 'default' | 'hero';

export type InputProps = ComponentPropsWithRef<'input'> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  variant?: InputVariant;
  reserveMessageSpace?: boolean;
};

const surfaceClasses: Record<InputVariant, string> = {
  default:
    'bg-control text-text-primary placeholder:text-text-secondary hover:bg-control-hover focus:bg-control-hover',
  hero: 'bg-hero-search text-hero-text placeholder:text-hero-text-muted hover:bg-hero-search-hover focus:bg-hero-search-hover',
};

const borderClasses: Record<InputVariant, string> = {
  default: 'border-border hover:border-text-secondary focus:border-text-secondary',
  hero: 'border-hero-search-border hover:border-hero-search-border-hover focus:border-hero-search-border-hover',
};

const focusRingClasses: Record<InputVariant, string> = {
  default: 'focus-visible:ring-action/20',
  hero: 'focus-visible:ring-hero-search-border',
};

export function Input({
  id,
  label,
  hint,
  error,
  variant = 'default',
  reserveMessageSpace = false,
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
          'min-h-11 w-full rounded-control border px-3 text-sm',
          'transition-[background-color,border-color,box-shadow] duration-200 ease-out',
          'focus-visible:outline-none focus-visible:ring-2',
          'motion-reduce:transition-none',
          'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
          surfaceClasses[variant],
          error ? 'border-error hover:border-error focus:border-error' : borderClasses[variant],
          focusRingClasses[variant],
          className,
        ].join(' ')}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
      />

      {(message || reserveMessageSpace) && (
        <p
          id={messageId}
          aria-hidden={message ? undefined : true}
          className={['min-h-5 text-caption', error ? 'text-error' : 'text-text-secondary'].join(
            ' ',
          )}
        >
          {message}
        </p>
      )}
    </div>
  );
}
