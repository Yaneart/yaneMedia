import { ContentRow, Skeleton, YaneMark, YaneMarkField } from '@/shared';

export function MediaCatalogSkeleton({ title }: { title: string }) {
  return (
    <section aria-busy="true" className="space-y-8">
      <p role="status" className="sr-only">
        Загружаем каталог «{title}»
      </p>

      <div className="relative isolate overflow-hidden rounded-card border border-context-border bg-linear-to-br from-watermark/38 via-watermark/26 to-watermark/32 p-2 shadow-surface sm:p-3">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-card"
        >
          <YaneMarkField />
          <YaneMark className="absolute -top-20 -right-12 hidden size-80 rotate-12 text-watermark opacity-watermark sm:block" />
        </div>
        <div
          aria-hidden="true"
          className="relative z-10 grid rounded-card border border-context-border/80 bg-surface/35 px-5 py-6 sm:px-7 sm:py-7 xl:grid-cols-[minmax(16rem,0.65fr)_minmax(34rem,1.35fr)] xl:items-center xl:gap-10 xl:px-10 xl:py-8"
        >
          <div>
            <Skeleton className="h-8 w-40" />
            <Skeleton className="mt-4 h-5 w-2/3" />
          </div>
          <div className="mt-5 xl:mt-0">
            <Skeleton className="h-11 w-full" />
            <div className="mt-3 flex gap-2">
              <Skeleton className="h-7 w-20 rounded-full" />
              <Skeleton className="h-7 w-16 rounded-full" />
              <Skeleton className="h-7 w-28 rounded-full" />
            </div>
          </div>
        </div>
      </div>

      {[0, 1, 2].map((row) => (
        <div key={row} aria-hidden="true">
          <Skeleton className="mb-4 h-7 w-48" />

          <ContentRow>
            {[0, 1, 2, 3, 4, 5].map((card) => (
              <div key={card}>
                <Skeleton className="aspect-2/3 rounded-card" />
                <Skeleton className="mt-2 h-5 w-3/4" />
                <Skeleton className="mt-2 h-4 w-1/3" />
              </div>
            ))}
          </ContentRow>
        </div>
      ))}
    </section>
  );
}
