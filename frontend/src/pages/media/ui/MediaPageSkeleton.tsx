import { Skeleton } from '@/shared';

export function MediaPageSkeleton() {
  return (
    <section
      aria-busy="true"
      className="grid min-w-0 items-start gap-8 xl:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)] xl:gap-10"
    >
      <p role="status" className="sr-only">
        Загружаем произведение
      </p>

      <div aria-hidden="true" className="order-2 min-w-0 space-y-8 xl:order-none xl:col-start-2">
        <Skeleton className="aspect-video w-full rounded-card" />

        <div className="hidden space-y-3 rounded-card border border-context-border p-6 xl:block">
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>

      <div aria-hidden="true" className="space-y-6 xl:col-start-1 xl:row-start-1">
        <Skeleton className="mx-auto aspect-2/3 w-full max-w-72 rounded-card xl:mx-0" />

        <div className="space-y-3">
          <Skeleton className="h-8 w-4/5" />
          <Skeleton className="h-5 w-2/5" />
          <Skeleton className="h-5 w-3/5" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    </section>
  );
}
