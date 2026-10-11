import { Skeleton } from './Skeleton';

export function MediaPageSkeleton() {
  return (
    <section
      aria-busy="true"
      className="grid min-w-0 items-start gap-8 xl:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)] xl:gap-10"
    >
      <p role="status" className="sr-only">
        Загружаем произведение
      </p>

      <div
        aria-hidden="true"
        className="order-2 min-w-0 space-y-8 xl:order-none xl:col-start-2 xl:row-start-1"
      >
        <div className="min-w-0 overflow-hidden rounded-card border border-context-border bg-surface shadow-surface">
          <div className="grid min-w-0 grid-cols-2 gap-3 bg-surface-elevated px-4 py-3 sm:px-5 2xl:flex 2xl:items-center">
            <Skeleton className="h-11 w-full rounded-control 2xl:w-40" />
            <Skeleton className="h-11 w-full rounded-control 2xl:w-48" />
            <Skeleton className="col-span-2 h-10 w-full rounded-control 2xl:ml-auto 2xl:w-44" />
          </div>
          <Skeleton className="aspect-video w-full rounded-none" />
        </div>

        <div className="hidden space-y-3 rounded-card border border-context-border bg-surface-elevated p-6 xl:block 2xl:hidden">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>

      <div
        aria-hidden="true"
        className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-4 gap-y-4 min-[360px]:grid-cols-[7rem_minmax(0,1fr)] sm:grid-cols-[9.5rem_minmax(0,1fr)] sm:gap-x-6 md:gap-x-8 xl:col-start-1 xl:row-start-1 xl:grid-cols-1"
      >
        <div className="min-w-0">
          <Skeleton className="aspect-2/3 w-full rounded-overlay xl:rounded-card" />
          <Skeleton className="mt-4 hidden h-11 w-full rounded-control sm:block xl:hidden" />
        </div>

        <div className="flex min-w-0 flex-col self-start">
          <Skeleton className="order-3 mt-3 h-4 w-32 xl:order-1 xl:mt-0 xl:w-40" />
          <Skeleton className="order-1 h-8 w-4/5 xl:order-2 xl:mt-3" />
          <Skeleton className="order-2 mt-1 h-4 w-2/5 xl:order-3" />
          <Skeleton className="order-4 mt-4 h-11 w-40 rounded-control sm:hidden xl:block" />

          <div className="order-5 mt-5 hidden space-y-2 sm:block xl:hidden">
            <Skeleton className="h-7 w-36" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>

        <Skeleton className="col-span-2 h-4 w-3/4 xl:col-span-1" />
      </div>

      <div
        aria-hidden="true"
        className="order-3 hidden space-y-3 rounded-card border border-context-border bg-surface-elevated p-6 2xl:col-span-2 2xl:block"
      >
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </section>
  );
}
