import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router';

import { useAuth } from '@/entities/auth';
import { isReviewId } from '@/entities/review';
import { reviewQueryOptions, type SocialViewer } from '@/features/social-data';
import { ErrorState, SocialNotFoundState, SocialPageSkeleton } from '@/shared';
import { ApiClientError } from '@/shared/api';

export function ReviewPage() {
  const reviewId = useParams().reviewId ?? '';
  const hasValidReviewId = isReviewId(reviewId);
  const { state } = useAuth();
  const viewer: SocialViewer =
    state.status === 'authenticated' ? { accountKey: state.user.email } : 'guest';
  const query = useQuery({
    ...reviewQueryOptions(reviewId, viewer),
    enabled: hasValidReviewId && state.status !== 'loading',
  });

  if (!hasValidReviewId) return <SocialNotFoundState kind="review" />;
  if (state.status === 'loading' || query.isPending) return <SocialPageSkeleton variant="review" />;
  if (query.error instanceof ApiClientError && query.error.status === 404) {
    return <SocialNotFoundState kind="review" />;
  }
  if (query.isError || !query.data) {
    return (
      <ErrorState
        variant="page"
        title="Не удалось загрузить рецензию"
        onRetry={() => void query.refetch({ cancelRefetch: false })}
      />
    );
  }

  const review = query.data;
  const author =
    review.author.state === 'active' ? review.author.user.displayName : review.author.label;
  return (
    <article className="mx-auto max-w-4xl py-8">
      <p className="text-caption font-semibold tracking-wider text-accent-text uppercase">
        Рецензия на «{review.media.title}»
      </p>
      <h1 data-page-heading tabIndex={-1} className="mt-2 text-3xl font-semibold text-text-primary">
        {review.title}
      </h1>
      <p className="mt-2 text-body text-text-secondary">{author}</p>
      {review.bodyState === 'visible' && review.body && (
        <p className="mt-8 whitespace-pre-wrap text-body text-text-primary">{review.body}</p>
      )}
    </article>
  );
}
