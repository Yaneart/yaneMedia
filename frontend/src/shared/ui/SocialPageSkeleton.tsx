import { Skeleton } from './Skeleton';
import { YaneMark } from './YaneMark';

export type SocialPageSkeletonProps = {
  variant: 'private-profile' | 'public-profile' | 'review';
};

export function SocialPageSkeleton({ variant }: SocialPageSkeletonProps) {
  const isReview = variant === 'review';
  const isPrivateProfile = variant === 'private-profile';

  if (isPrivateProfile) {
    return (
      <section
        aria-label="Загружаем страницу"
        aria-busy="true"
        className="relative isolate mx-auto max-w-[1600px] overflow-hidden rounded-card border border-context-border bg-linear-to-br from-watermark/38 via-watermark/26 to-watermark/32 p-2 shadow-surface sm:p-3"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        >
          <YaneMark className="absolute -left-10 top-[8%] size-48 rotate-12 text-watermark opacity-[0.28]" />
          <YaneMark className="absolute left-[38%] top-[34%] size-40 -rotate-12 text-watermark opacity-[0.25]" />
          <YaneMark className="absolute -right-10 top-[16%] size-52 rotate-[24deg] text-watermark opacity-[0.3]" />
          <YaneMark className="absolute left-[68%] bottom-[6%] size-44 -rotate-[28deg] text-watermark opacity-[0.28]" />
        </div>
        <div className="relative z-10 space-y-3">
          <div className="rounded-card border border-context-border/80 bg-surface/35 p-3 sm:p-4">
            <div className="grid items-center gap-4 sm:grid-cols-[160px_minmax(0,1fr)] lg:grid-cols-[160px_minmax(0,1fr)_auto]">
              <div>
                <Skeleton className="mx-auto size-28 rounded-full" />
                <Skeleton className="mt-3 h-9 rounded-control" />
                <Skeleton className="mt-1 h-8 rounded-control" />
              </div>
              <div className="min-w-0 flex-1">
                <Skeleton className="h-5 w-44 rounded-pill" />
                <Skeleton className="mt-2 h-9 w-3/5 max-w-lg rounded-control" />
                <Skeleton className="mt-1 h-5 w-36 rounded-pill" />
              </div>
              <Skeleton className="h-10 w-48 rounded-control sm:col-span-2 sm:justify-self-start lg:col-span-1 lg:justify-self-end" />
            </div>
          </div>
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,0.85fr)]">
            <div className="rounded-card border border-border bg-surface/40 p-3 sm:p-4 xl:p-5">
              <Skeleton className="h-7 w-56 rounded-control" />
              <Skeleton className="mt-3 h-5 w-4/5 max-w-2xl rounded-pill" />
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <Skeleton className="h-20 rounded-control" />
                <Skeleton className="h-20 rounded-control" />
              </div>
              <Skeleton className="mt-5 h-36 rounded-control" />
              <Skeleton className="mt-5 h-28 rounded-control" />
              <Skeleton className="mt-5 h-16 rounded-control" />
            </div>
            <div className="space-y-3">
              <Skeleton className="h-36 rounded-card" />
              <Skeleton className="h-28 rounded-card" />
              <Skeleton className="h-16 rounded-card" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Загружаем страницу" aria-busy="true" className={isReview ? 'mx-auto max-w-5xl py-8' : 'mx-auto max-w-[1600px] rounded-card border border-context-border bg-linear-to-br from-watermark/38 via-watermark/26 to-watermark/32 p-2 shadow-surface sm:p-3'}>
      <div className={isReview ? 'rounded-card border border-border bg-surface p-5 sm:p-8' : 'rounded-card border border-context-border/80 bg-surface/35 p-3 sm:p-4'}>
        <div className="flex flex-col items-start gap-4 sm:flex-row">
          {!isReview && <Skeleton className="size-20 shrink-0 rounded-full sm:size-28" />}
          <div className="min-w-0 flex-1">
            <Skeleton className="h-4 w-24 rounded-pill" />
            <Skeleton className="mt-3 h-8 w-3/5 max-w-md rounded-control" />
            <Skeleton className="mt-3 h-4 w-2/5 max-w-xs rounded-pill" />
          </div>
        </div>
        <Skeleton className="mt-8 h-20 w-full rounded-control" />
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-20 rounded-control" />
          <Skeleton className="h-20 rounded-control" />
          <Skeleton className="h-20 rounded-control" />
        </div>
        {variant === 'public-profile' && (
          <div className="mt-6 overflow-hidden rounded-card border border-border">
            <div className="flex gap-2 border-b border-border p-2">
              <Skeleton className="h-10 w-28 rounded-control" />
              <Skeleton className="h-10 w-24 rounded-control" />
              <Skeleton className="h-10 w-28 rounded-control" />
            </div>
            <div className="grid gap-3 p-4 sm:p-6">
              <Skeleton className="h-20 rounded-control" />
              <Skeleton className="h-20 rounded-control" />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
