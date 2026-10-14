import { Skeleton } from './Skeleton';

export type SocialPageSkeletonProps = {
  variant: 'private-profile' | 'public-profile' | 'review';
};

export function SocialPageSkeleton({ variant }: SocialPageSkeletonProps) {
  const isReview = variant === 'review';
  const isPrivateProfile = variant === 'private-profile';

  return (
    <section aria-label="Загружаем страницу" aria-busy="true" className="mx-auto max-w-5xl py-8">
      <div className="rounded-card border border-border bg-surface p-5 sm:p-8">
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
        {isPrivateProfile && (
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-24 rounded-control" />
            <Skeleton className="h-24 rounded-control" />
            <Skeleton className="h-24 rounded-control" />
            <Skeleton className="h-24 rounded-control" />
          </div>
        )}
      </div>
    </section>
  );
}
