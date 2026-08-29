import { Spinner } from './Spinner';

export type LoadingStateVariant = 'page' | 'section';

export type LoadingStateProps = {
  label: string;
  variant?: LoadingStateVariant;
  className?: string;
};

export function LoadingState({ label, variant = 'section', className = '' }: LoadingStateProps) {
  const isPage = variant === 'page';

  return (
    <div
      aria-busy="true"
      className={[
        'relative isolate flex items-center justify-center overflow-hidden px-6 text-center',
        isPage ? 'h-full min-h-[60vh] py-12' : 'min-h-64 py-10',
        className,
      ].join(' ')}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <span
          className={[
            'absolute top-1/2 left-1/2 h-60 w-72 -translate-x-1/2 -translate-y-1/2 rounded-[50%]',
            'bg-watermark/12 blur-3xl sm:h-80 sm:w-[36rem]',
          ].join(' ')}
        />
        <span
          className={[
            'absolute top-1/2 left-1/2 h-32 w-48 -translate-x-1/2 -translate-y-1/2 rounded-[50%]',
            'bg-watermark/10 blur-2xl sm:h-48 sm:w-96',
          ].join(' ')}
        />
      </div>

      <Spinner size="large" label={label} className="relative z-10" />
    </div>
  );
}
