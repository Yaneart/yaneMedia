import type { ComponentPropsWithRef } from 'react';

export type SpinnerSize = 'small' | 'medium' | 'large';

export type SpinnerProps = Omit<ComponentPropsWithRef<'span'>, 'children' | 'role'> & {
  size?: SpinnerSize;
  label?: string;
};

const sizeClasses: Record<SpinnerSize, string> = {
  small: 'text-sm',
  medium: 'text-xl',
  large: 'text-3xl',
};

export function Spinner({
  size = 'medium',
  label = 'Загрузка...',
  className = '',
  'aria-live': ariaLive = 'polite',
  ...props
}: SpinnerProps) {
  return (
    <span
      {...props}
      role="status"
      aria-live={ariaLive}
      className={[
        'inline-flex items-baseline justify-center leading-none',
        sizeClasses[size],
        className,
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className="inline-flex font-extrabold tracking-[-0.06em] text-text-primary"
      >
        <span className="yane-loader-shimmer">yane</span>
        <span className="ml-[0.3em] self-end pb-[0.08em] text-[0.45em] font-medium tracking-tight text-text-secondary">
          Media
        </span>
      </span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
