import { Button } from './Button';
import { StateAmbientBackdrop } from './StateAmbientBackdrop';
import { YaneMark } from './YaneMark';

export type ErrorStateVariant = 'page' | 'section' | 'player';
export type ErrorStateTone = 'accent' | 'error';

export type ErrorStateProps = {
  title: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  variant?: ErrorStateVariant;
  eyebrow?: string;
  visualCode?: string;
  visualLabel?: string;
  tone?: ErrorStateTone;
  className?: string;
};

export function ErrorState({
  title,
  description = 'Попробуйте ещё раз немного позже.',
  onRetry,
  retryLabel = 'Повторить',
  variant = 'section',
  eyebrow = 'Связь прервана',
  visualCode = '!',
  visualLabel = 'Сигнал потерян',
  tone = 'error',
  className = '',
}: ErrorStateProps) {
  const isError = tone === 'error';

  if (variant === 'page') {
    return (
      <section
        role={isError ? 'alert' : undefined}
        className={[
          'relative isolate flex h-full min-h-[60vh] items-center overflow-hidden py-8 sm:py-12',
          className,
        ].join(' ')}
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
          <div
            className={[
              'absolute inset-x-[2%] top-[6%] bottom-[6%] overflow-hidden rounded-[3rem]',
              'sm:inset-x-[4%] sm:top-[8%] sm:bottom-[10%] sm:rounded-[4rem]',
            ].join(' ')}
          >
            <div className="absolute inset-0 bg-linear-to-r from-transparent via-watermark/5 to-transparent" />
            <div
              className={[
                'absolute -top-1/3 -bottom-1/3 left-1/2 w-[88%] -translate-x-1/2 rounded-[50%]',
                'bg-watermark/10 blur-3xl',
              ].join(' ')}
            />

            <span className="absolute inset-x-[5%] top-0 h-px bg-linear-to-r from-transparent via-watermark/30 to-transparent" />
            <span className="absolute inset-x-[5%] bottom-0 h-px bg-linear-to-r from-transparent via-watermark/30 to-transparent" />

            <YaneMark
              className={[
                'absolute top-1/2 -right-24 hidden size-[34rem] -translate-y-1/2 rotate-12',
                'text-watermark opacity-[0.065] md:block xl:-right-8 xl:size-[40rem]',
              ].join(' ')}
            />
            <YaneMark
              className={[
                'absolute -bottom-36 -left-24 hidden size-[30rem] -rotate-12',
                'text-watermark opacity-[0.045] lg:block',
              ].join(' ')}
            />
            <YaneMark
              className={[
                'absolute -top-24 left-[43%] hidden size-72 rotate-[32deg]',
                'text-watermark opacity-[0.035] xl:block',
              ].join(' ')}
            />

            <YaneMark
              className={[
                'absolute -right-20 -bottom-16 size-64 rotate-12 text-watermark opacity-[0.04]',
                'md:hidden',
              ].join(' ')}
            />
          </div>
        </div>

        <div
          className={[
            'relative z-10 mx-auto grid w-full max-w-4xl items-center gap-8',
            'md:grid-cols-[13rem_minmax(0,1fr)] md:gap-12',
          ].join(' ')}
        >
          <div
            aria-hidden="true"
            className={[
              'relative mx-auto flex size-44 items-center justify-center overflow-hidden rounded-[2rem]',
              'border border-context-border',
              'bg-linear-to-br from-watermark/25 via-surface-elevated to-surface',
              'shadow-overlay sm:size-52',
            ].join(' ')}
          >
            <YaneMark
              className={[
                'absolute -right-16 -bottom-10 h-[105%] w-[165%] rotate-12',
                'text-watermark/35',
              ].join(' ')}
            />

            <div
              className={[
                'relative flex size-20 -translate-y-3 items-center justify-center rounded-full border',
                'bg-surface-elevated/90 shadow-overlay backdrop-blur-sm',
                isError
                  ? 'border-error/70 bg-error/5 text-error ring-4 ring-error/10'
                  : 'border-watermark/35 text-watermark',
              ].join(' ')}
            >
              <span
                className={[
                  'font-semibold tracking-[-0.04em]',
                  visualCode.length > 1 ? 'text-xl' : 'text-4xl',
                ].join(' ')}
              >
                {visualCode}
              </span>
            </div>

            <div
              className={[
                'absolute right-4 bottom-4 left-4 flex items-center justify-center gap-2',
                'rounded-pill border border-context-border bg-surface-elevated/85',
                'px-3 py-1.5 shadow-sm backdrop-blur-sm',
              ].join(' ')}
            >
              <span
                className={[
                  'size-1.5 shrink-0 rounded-full',
                  isError ? 'bg-error' : 'bg-watermark',
                ].join(' ')}
              />
              <span className="text-[0.625rem] font-semibold tracking-[0.14em] text-text-secondary uppercase">
                {visualLabel}
              </span>
            </div>
          </div>

          <div className="text-center md:text-left">
            <p className="text-caption font-semibold tracking-[0.14em] text-accent-text uppercase">
              {eyebrow}
            </p>

            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-text-primary sm:text-4xl">
              {title}
            </h1>

            <p className="mx-auto mt-3 max-w-xl text-body text-text-secondary md:mx-0">
              {description}
            </p>

            {onRetry && (
              <Button className="mt-6" onClick={onRetry}>
                {retryLabel}
              </Button>
            )}
          </div>
        </div>
      </section>
    );
  }

  const isPlayer = variant === 'player';

  return (
    <div
      role={isError ? 'alert' : 'status'}
      className={[
        'relative isolate flex items-center justify-center',
        isPlayer
          ? 'flex-row gap-3 px-3 py-3 text-left min-[360px]:gap-4 min-[360px]:px-4 min-[360px]:py-4'
          : 'flex-col gap-5 overflow-hidden px-6 py-10 text-center sm:flex-row sm:text-left',
        className,
      ].join(' ')}
    >
      {!isPlayer && <StateAmbientBackdrop />}

      <div
        aria-hidden="true"
        className={[
          'relative z-10 flex shrink-0 items-center justify-center overflow-hidden rounded-overlay border',
          isPlayer
            ? 'size-12 border-white/20 bg-white/10 min-[360px]:size-16'
            : 'size-20 border-context-border bg-linear-to-br from-watermark/25 via-surface-elevated to-surface',
        ].join(' ')}
      >
        <YaneMark className="absolute -right-5 -bottom-3 h-[105%] w-[160%] rotate-12 text-watermark/35" />
        <span
          className={[
            'relative flex size-9 items-center justify-center rounded-full border font-semibold',
            'text-xl ring-2',
            isError
              ? 'border-error/70 text-error ring-error/10'
              : 'border-watermark/60 text-watermark ring-watermark/10',
            isPlayer ? 'bg-black/45' : isError ? 'bg-error/10' : 'bg-watermark/10',
          ].join(' ')}
        >
          {visualCode}
        </span>
      </div>

      <div className="relative z-10 min-w-0 max-w-lg">
        <p
          className={[
            'text-[0.625rem] font-semibold tracking-[0.14em] uppercase',
            isPlayer ? 'text-watermark' : 'text-accent-text',
          ].join(' ')}
        >
          {visualLabel}
        </p>

        <p
          className={[
            'mt-1 font-semibold',
            isPlayer
              ? 'text-sm text-white min-[360px]:text-base'
              : 'text-heading text-text-primary',
          ].join(' ')}
        >
          {title}
        </p>

        {description && (
          <p
            className={[
              'mt-1.5',
              isPlayer
                ? 'text-caption text-white/65 max-[359px]:sr-only'
                : 'text-body text-text-secondary',
            ].join(' ')}
          >
            {description}
          </p>
        )}

        {onRetry && (
          <Button
            size={isPlayer ? 'small' : 'medium'}
            variant={isPlayer ? 'bare' : 'secondary'}
            className={
              isPlayer
                ? 'mt-3 border border-white/25 bg-white/10 text-white hover:bg-white/15'
                : 'mt-4'
            }
            onClick={onRetry}
          >
            {retryLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
