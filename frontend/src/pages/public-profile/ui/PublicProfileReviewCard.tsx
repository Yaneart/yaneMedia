import { Link } from 'react-router';

import { createReviewPath } from '@/app/router/routes';
import { MediaLink, MediaPosterFallback } from '@/entities/media';
import type { OwnReviewSummary, ReviewSummary } from '@/entities/review';
import { ReviewSpoiler } from '@/features/review-spoiler';
import { StarIcon } from '@/shared';
import { formatReviewDate } from '../model/profileActivityPresentation';

export function PublicProfileReviewCard({ review }: { review: ReviewSummary | OwnReviewSummary }) {
  const poster = review.media.poster;
  const isModerationHidden =
    'publicationState' in review && review.publicationState === 'moderation-hidden';

  return (
    <article className="flex min-w-0 gap-4 rounded-control border border-border bg-surface-elevated p-4 sm:gap-5">
      <MediaLink
        mediaRef={review.media.mediaRef}
        summary={review.media}
        aria-label={`Открыть ${review.media.title}`}
        className="hidden w-24 shrink-0 sm:block"
      >
        <div className="aspect-2/3 overflow-hidden rounded-control border border-context-border bg-elevated">
          {poster ? (
            <img
              src={poster.url}
              alt=""
              width={poster.width}
              height={poster.height}
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
          ) : (
            <MediaPosterFallback
              mediaRef={review.media.mediaRef}
              title={review.media.title}
              type={review.media.type}
            />
          )}
        </div>
      </MediaLink>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-caption text-text-secondary">
          <MediaLink
            mediaRef={review.media.mediaRef}
            summary={review.media}
            className="min-w-0 truncate font-semibold text-accent-text hover:underline"
          >
            {review.media.title}
          </MediaLink>
          {review.rating !== null && (
            <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-text-primary">
              <StarIcon className="size-4 text-watermark" aria-hidden="true" />
              {review.rating}/10
            </span>
          )}
          <time dateTime={review.createdAt}>{formatReviewDate(review.createdAt)}</time>
        </div>

        <h3 className="mt-2 text-lg font-semibold leading-snug text-text-primary">
          <Link
            to={createReviewPath(review.reviewId)}
            className="outline-none hover:text-accent-text hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-action/20"
          >
            {review.title}
          </Link>
        </h3>

        {isModerationHidden && (
          <div
            role="status"
            className="mt-3 rounded-control border border-watermark/30 bg-watermark/10 px-3 py-2"
          >
            <p className="text-sm font-semibold text-text-primary">Скрыта модерацией</p>
            <p className="mt-1 text-caption text-text-secondary">
              Этот материал виден только вам. Служебные данные не раскрываются.
            </p>
          </div>
        )}

        {!isModerationHidden && (
          <ReviewSpoiler
            reviewId={review.reviewId}
            hidden={review.bodyState === 'spoiler-hidden'}
            content={review.excerpt}
            variant="summary"
          />
        )}

        <Link
          to={createReviewPath(review.reviewId)}
          className="mt-3 inline-flex min-h-8 items-center text-sm font-semibold text-accent-text outline-none hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-action/20"
        >
          Читать рецензию
        </Link>
      </div>
    </article>
  );
}
