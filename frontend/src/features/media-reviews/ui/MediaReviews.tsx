import { useInfiniteQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { useAuth } from '@/entities/auth';
import type { MediaSummary } from '@/entities/media';
import type { ReviewSort } from '@/entities/review';
import { SocialLoginLink } from '@/features/social-access';
import { mediaReviewsQueryOptions, type SocialViewer } from '@/features/social-data';
import { Button, ErrorState, LoadMoreButton, ProfileIcon, Select, Skeleton } from '@/shared';
import { mergeCursorPages } from '@/shared/api';
import { isReviewSort, mediaReviewSortOptions } from '../model/mediaReviewsPresentation';
import { MediaReviewCard } from './MediaReviewCard';

function ReviewsSkeleton() {
  return (
    <div aria-label="Загружаем рецензии" aria-busy="true" className="grid gap-3 lg:grid-cols-2">
      <Skeleton className="h-56 rounded-control" />
      <Skeleton className="h-56 rounded-control" />
    </div>
  );
}

function EmptyReviews({
  authStatus,
  onRetryAuth,
}: {
  authStatus: 'guest' | 'authenticated' | 'error';
  onRetryAuth: () => void;
}) {
  const isGuest = authStatus === 'guest';
  return (
    <div className="rounded-control border border-dashed border-border px-5 py-8 text-center sm:px-8">
      <span className="mx-auto grid size-10 place-items-center rounded-full bg-watermark/10 text-accent-text">
        <ProfileIcon className="size-5" aria-hidden="true" />
      </span>
      <h3 className="mt-3 text-lg font-semibold text-text-primary">Рецензий пока нет</h3>
      <p className="mx-auto mt-2 max-w-lg text-sm text-text-secondary">
        {isGuest
          ? 'Войдите, чтобы первым поделиться развёрнутым мнением об этом произведении.'
          : 'Станьте первым зрителем, который поделится развёрнутым мнением.'}
      </p>
      {authStatus === 'error' ? (
        <Button className="mt-5" variant="secondary" onClick={onRetryAuth}>
          Повторить проверку сессии
        </Button>
      ) : isGuest ? (
        <SocialLoginLink
          intent="review"
          className="mt-5 inline-flex min-h-10 items-center justify-center rounded-control bg-action px-4 text-sm font-semibold text-action-text transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-action/20 focus-visible:outline-none motion-reduce:transition-none"
        >
          Войти и написать
        </SocialLoginLink>
      ) : (
        <a
          href="#review-editor"
          className="mt-5 inline-flex min-h-10 items-center justify-center rounded-control bg-action px-4 text-sm font-semibold text-action-text transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-action/20 focus-visible:outline-none motion-reduce:transition-none"
        >
          Написать первую рецензию
        </a>
      )}
    </div>
  );
}

export function MediaReviews({ media }: { media: MediaSummary }) {
  const { state: authState, refresh } = useAuth();
  const [sort, setSort] = useState<ReviewSort>('new');
  const viewer: SocialViewer =
    authState.status === 'authenticated' ? { accountKey: authState.user.email } : 'guest';
  const viewerReady = authState.status !== 'loading';
  const query = useInfiniteQuery({
    ...mediaReviewsQueryOptions(media.mediaRef, sort, viewer),
    enabled: viewerReady,
  });
  const reviews = mergeCursorPages(query.data?.pages ?? [], (review) => review.reviewId);

  return (
    <section
      aria-labelledby="media-reviews-heading"
      className="min-w-0 rounded-card border border-context-border bg-surface p-5 sm:p-6"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-caption font-semibold tracking-wider text-accent-text uppercase">
            Мнения зрителей
          </p>
          <h2 id="media-reviews-heading" className="mt-1 text-heading text-text-primary">
            Рецензии
          </h2>
        </div>
        <Select
          aria-label="Сортировка рецензий"
          value={sort}
          options={mediaReviewSortOptions}
          placeholder="Сортировка"
          allowEmpty={false}
          onChange={(value) => {
            if (isReviewSort(value)) setSort(value);
          }}
        />
      </div>

      <div className="mt-5">
        {!viewerReady || query.isPending ? (
          <ReviewsSkeleton />
        ) : query.isError && reviews.length === 0 ? (
          <ErrorState
            title="Не удалось загрузить рецензии"
            description="Просмотр и сведения о произведении продолжают работать. Этот раздел можно загрузить отдельно."
            onRetry={() => void query.refetch()}
          />
        ) : reviews.length === 0 ? (
          <EmptyReviews authStatus={authState.status} onRetryAuth={() => void refresh()} />
        ) : (
          <>
            <div className="grid items-start gap-3 lg:grid-cols-2">
              {reviews.map((review) => (
                <MediaReviewCard key={review.reviewId} review={review} />
              ))}
            </div>

            {(query.hasNextPage || query.isFetchNextPageError) && (
              <div className="mt-6 flex flex-col items-center gap-2 border-t border-border pt-5">
                <LoadMoreButton
                  isLoading={query.isFetchingNextPage}
                  hasError={query.isFetchNextPageError}
                  onClick={() => void query.fetchNextPage({ cancelRefetch: false })}
                />
                {query.isFetchNextPageError && (
                  <p role="status" className="text-center text-caption text-danger">
                    Следующая страница не загрузилась. Уже показанные рецензии сохранены.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
}
