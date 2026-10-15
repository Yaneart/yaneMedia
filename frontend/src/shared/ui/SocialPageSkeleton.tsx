import { Skeleton } from './Skeleton';
import { YaneMark, YaneMarkField } from './YaneMark';

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
            <div className="flex flex-col gap-3">
              <div className="rounded-card border border-border bg-surface/40 p-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Skeleton className="h-4 w-24 rounded-pill" />
                    <Skeleton className="mt-1 h-7 w-32 rounded-control" />
                  </div>
                  <Skeleton className="size-11 shrink-0 rounded-full" />
                </div>
                <Skeleton className="mt-3 h-[4.5rem] rounded-control" />
                <Skeleton className="mt-4 h-10 w-36 rounded-control" />
              </div>
              <div className="rounded-card border border-border bg-surface/40 p-3">
                <Skeleton className="h-6 w-40 rounded-control" />
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Skeleton className="h-[4.5rem] rounded-control" />
                  <Skeleton className="h-[4.5rem] rounded-control" />
                  <Skeleton className="h-[4.5rem] rounded-control" />
                </div>
              </div>
              <div className="flex-1 rounded-card border border-border bg-surface/40 p-3">
                <Skeleton className="h-6 w-44 rounded-control" />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Skeleton className="h-12 rounded-control" />
                  <Skeleton className="h-12 rounded-control" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (isReview) {
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
          <YaneMark className="absolute -left-10 top-12 size-48 rotate-[18deg] text-watermark opacity-[0.24]" />
          <YaneMark className="absolute left-[34%] -top-12 size-56 -rotate-[18deg] text-watermark opacity-[0.2]" />
          <YaneMark className="absolute -right-12 top-[32rem] size-56 -rotate-[20deg] text-watermark opacity-[0.24]" />
        </div>
        <div className="relative z-10 space-y-3">
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_18rem]">
            <div className="rounded-card border border-context-border/80 bg-surface/40 p-4 sm:p-6 lg:p-8">
              <Skeleton className="h-4 w-56 rounded-pill" />
              <Skeleton className="mt-3 h-10 w-3/4 max-w-3xl rounded-control" />
              <div className="mt-6 flex items-center gap-3">
                <Skeleton className="size-11 rounded-full" />
                <Skeleton className="h-10 w-48 rounded-control" />
                <Skeleton className="h-9 w-20 rounded-pill" />
              </div>
              <Skeleton className="mt-5 h-4 w-64 rounded-pill" />
              <Skeleton className="mt-8 h-72 rounded-control" />
              <Skeleton className="mt-6 h-10 w-52 rounded-control" />
            </div>
            <div className="rounded-card border border-context-border/80 bg-surface/40 p-3 sm:p-4">
              <Skeleton className="mx-auto aspect-2/3 max-w-48 rounded-control xl:max-w-none" />
              <Skeleton className="mt-3 h-6 w-4/5 rounded-control" />
              <Skeleton className="mt-2 h-4 w-3/5 rounded-pill" />
            </div>
          </div>
          <div className="rounded-card border border-context-border/80 bg-surface/40 p-4 sm:p-6 lg:p-8">
            <Skeleton className="h-8 w-52 rounded-control" />
            <Skeleton className="mt-2 h-4 w-40 rounded-pill" />
            <Skeleton className="mt-6 h-32 rounded-control" />
            <Skeleton className="mt-3 h-28 rounded-control" />
          </div>
        </div>
      </section>
    );
  }

  if (variant === 'public-profile') {
    return (
      <section
        aria-label="Р—Р°РіСЂСѓР¶Р°РµРј СЃС‚СЂР°РЅРёС†Сѓ"
        aria-busy="true"
        className="relative isolate mx-auto max-w-[1600px] overflow-hidden rounded-card border border-context-border bg-linear-to-br from-watermark/38 via-watermark/26 to-watermark/32 p-2 shadow-surface sm:p-3"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
        >
          <YaneMarkField />
          <div className="absolute inset-0 bg-linear-to-br from-transparent via-transparent to-watermark/8" />
        </div>
        <div className="relative z-10 space-y-3">
          <header className="rounded-card border border-context-border/80 bg-surface/35 p-3 sm:p-4">
            <div className="grid items-center gap-4 sm:grid-cols-[112px_minmax(0,1fr)] lg:grid-cols-[128px_minmax(0,1fr)_auto]">
              <Skeleton className="mx-auto size-24 rounded-full sm:size-28 lg:size-32" />
              <div className="min-w-0">
                <Skeleton className="h-7 w-36 rounded-pill" />
                <Skeleton className="mt-2 h-12 w-3/5 max-w-lg rounded-control" />
                <Skeleton className="mt-1 h-5 w-36 rounded-pill" />
                <Skeleton className="mt-2 h-5 w-48 rounded-pill" />
                <Skeleton className="mt-3 h-4 w-48 rounded-pill" />
              </div>
              <Skeleton className="h-11 w-40 rounded-control sm:col-span-2 sm:justify-self-start lg:col-span-1 lg:justify-self-end" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-4">
              {Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className="rounded-control border border-context-border bg-surface-elevated/65 p-2.5"
                >
                  <Skeleton className="h-4 w-2/3 rounded-pill" />
                  <Skeleton className="mt-1 h-8 w-8 rounded-control" />
                </div>
              ))}
            </div>
          </header>

          <section className="overflow-hidden rounded-card border border-border bg-surface/40">
            <div className="flex gap-2 overflow-hidden border-b border-border/80 p-2">
              <Skeleton className="h-10 w-24 rounded-control bg-watermark/20" />
              <Skeleton className="h-10 w-28 rounded-control" />
              <Skeleton className="h-10 w-24 rounded-control" />
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 p-4 sm:p-6 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="min-w-0">
                  <Skeleton className="aspect-2/3 rounded-card" />
                  <Skeleton className="mt-2 h-5 w-4/5 rounded-control" />
                  <Skeleton className="mt-2 h-4 w-2/5 rounded-control" />
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Загружаем страницу"
      aria-busy="true"
      className="mx-auto max-w-[1600px] rounded-card border border-context-border bg-linear-to-br from-watermark/38 via-watermark/26 to-watermark/32 p-2 shadow-surface sm:p-3"
    >
      <div className="rounded-card border border-context-border/80 bg-surface/35 p-3 sm:p-4">
        <div className="flex flex-col items-start gap-4 sm:flex-row">
          <Skeleton className="size-20 shrink-0 rounded-full sm:size-28" />
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
      </div>
    </section>
  );
}
