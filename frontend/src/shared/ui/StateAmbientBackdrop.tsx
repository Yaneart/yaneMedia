import { YaneMark } from './YaneMark';

export function StateAmbientBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-x-[3%] top-1/2 h-[88%] -translate-y-1/2 overflow-hidden rounded-[2rem]">
        <div className="absolute inset-0 bg-linear-to-r from-transparent via-watermark/10 to-transparent" />
        <div className="absolute -inset-y-1/2 left-1/2 w-[72%] -translate-x-1/2 rounded-[50%] bg-watermark/10 blur-3xl" />

        <span className="absolute inset-x-[6%] top-0 h-px bg-linear-to-r from-transparent via-watermark/25 to-transparent" />
        <span className="absolute inset-x-[6%] bottom-0 h-px bg-linear-to-r from-transparent via-watermark/25 to-transparent" />

        <YaneMark className="absolute -top-20 -right-16 size-64 rotate-12 text-watermark opacity-[0.055]" />
        <YaneMark className="absolute -bottom-24 -left-12 hidden size-56 -rotate-12 text-watermark opacity-[0.035] sm:block" />
      </div>
    </div>
  );
}
