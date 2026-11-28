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
      <span
        aria-hidden="true"
        className="loading-state-glow pointer-events-none absolute inset-0 m-auto h-full max-h-96 w-full max-w-lg sm:max-h-[36rem] sm:max-w-4xl"
      />

      <Spinner size="large" label={label} className="relative z-10" />
    </div>
  );
}
