import { Skeleton } from '@/shared';

type HomeCollectionsSkeletonProps = {
  rows?: number;
};

export function HomeCollectionsSkeleton({ rows = 1 }: HomeCollectionsSkeletonProps) {
  return Array.from({ length: rows }, (_, rowIndex) => (
    <section key={rowIndex} aria-label="Загружаем подборку">
      <Skeleton className="mb-4 h-7 w-52 rounded-control" />
      <div className="grid grid-cols-2 gap-4 overflow-hidden sm:grid-flow-col sm:grid-cols-none sm:auto-cols-[calc((100%_-_1rem)/2)] md:auto-cols-[calc((100%_-_2rem)/3)] xl:auto-cols-[calc((100%_-_4rem)/5)] 2xl:auto-cols-[calc((100%_-_5rem)/6)]">
        {Array.from({ length: 6 }, (_, cardIndex) => (
          <div key={cardIndex} className={cardIndex > 1 ? 'hidden sm:block' : ''}>
            <Skeleton className="aspect-2/3 w-full rounded-card" />
            <Skeleton className="mt-2 h-5 w-4/5 rounded-control" />
            <Skeleton className="mt-1 h-4 w-2/5 rounded-control" />
          </div>
        ))}
      </div>
    </section>
  ));
}
