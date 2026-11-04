import type { ComponentPropsWithRef } from 'react';

export type SpinnerSize = 'small' | 'medium' | 'large';

export type SpinnerProps = Omit<ComponentPropsWithRef<'span'>, 'children' | 'role'> & {
  size?: SpinnerSize;
  label?: string;
  progress?: number;
};

const sizeClasses: Record<SpinnerSize, string> = {
  small: 'text-sm',
  medium: 'text-xl',
  large: 'text-4xl sm:text-5xl',
};

export function Spinner({
  size = 'medium',
  label = 'Загрузка...',
  progress,
  className = '',
  'aria-live': ariaLive = 'polite',
  ...props
}: SpinnerProps) {
  const percent = progress === undefined ? undefined : Math.max(0, Math.min(100, progress));
  const wordmark = (
    <>
      <span>yane</span>
      <span className="ml-[0.3em] self-end pb-[0.08em] text-[0.45em] font-medium tracking-tight">
        Media
      </span>
    </>
  );

  return (
    <span
      {...props}
      role={percent === undefined ? 'status' : 'progressbar'}
      aria-live={ariaLive}
      aria-label={percent === undefined ? undefined : label}
      aria-valuemin={percent === undefined ? undefined : 0}
      aria-valuemax={percent === undefined ? undefined : 100}
      aria-valuenow={percent}
      className={[
        'inline-flex items-baseline justify-center leading-none',
        sizeClasses[size],
        className,
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className="relative inline-flex font-extrabold tracking-[-0.06em] text-text-primary"
      >
        {percent === undefined ? (
          <>
            <span className="yane-loader-shimmer" data-text="yane">
              yane
            </span>
            <span className="ml-[0.3em] self-end pb-[0.08em] text-[0.45em] font-medium tracking-tight text-text-secondary">
              Media
            </span>
          </>
        ) : (
          <>
            <span className="inline-flex opacity-20">{wordmark}</span>
            <span
              className="absolute inset-0 inline-flex transition-[clip-path] duration-700 ease-out motion-reduce:transition-none"
              style={{ clipPath: `inset(-0.1em ${100 - percent}% -0.2em 0)` }}
            >
              {wordmark}
            </span>
          </>
        )}
      </span>
      {percent === undefined && <span className="sr-only">{label}</span>}
    </span>
  );
}
