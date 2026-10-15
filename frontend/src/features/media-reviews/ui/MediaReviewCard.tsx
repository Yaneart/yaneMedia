import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import { createPublicProfilePath, createReviewPath } from '@/app/router/routes';
import type { ReviewSummary } from '@/entities/review';
import { ReviewSpoiler } from '@/features/review-spoiler';
import { CommentIcon, ProfileIcon, StarIcon } from '@/shared';
import { formatMediaReviewDate } from '../model/mediaReviewsPresentation';

function ReviewAuthor({ review }: { review: ReviewSummary }) {
  const [hasAvatarError, setHasAvatarError] = useState(false);
  const author = review.author;
  const avatarUrl = author.state === 'active' ? author.user.avatarUrl : null;

  useEffect(() => setHasAvatarError(false), [avatarUrl]);

  if (author.state === 'deleted') {
    return (
      <span className="inline-flex min-w-0 items-center gap-2 font-semibold text-text-primary">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-control">
          <ProfileIcon className="size-4 text-text-secondary" aria-hidden="true" />
        </span>
        <span className="truncate">{author.label}</span>
      </span>
    );
  }

  return (
    <Link
      to={createPublicProfilePath(author.user.handle)}
      className="inline-flex min-w-0 items-center gap-2 font-semibold text-text-primary outline-none hover:text-accent-text hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-action/20"
    >
      {avatarUrl && !hasAvatarError ? (
        <img
          src={avatarUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-9 shrink-0 rounded-full bg-control object-cover"
          onError={() => setHasAvatarError(true)}
        />
      ) : (
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-watermark/10 text-sm font-semibold text-accent-text">
          {Array.from(author.user.displayName.trim() || author.user.handle)[0]?.toUpperCase() ??
            '?'}
        </span>
      )}
      <span className="truncate">{author.user.displayName}</span>
    </Link>
  );
}

export function MediaReviewCard({ review }: { review: ReviewSummary }) {
  return (
    <article className="min-w-0 rounded-control border border-border bg-surface-elevated p-4 sm:p-5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 text-caption text-text-secondary">
        <ReviewAuthor review={review} />
        {review.rating !== null && (
          <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-text-primary">
            <StarIcon className="size-4 text-watermark" aria-hidden="true" />
            {review.rating}/10
          </span>
        )}
        <time dateTime={review.createdAt}>{formatMediaReviewDate(review.createdAt)}</time>
      </div>

      <h3 className="mt-4 text-lg font-semibold leading-snug text-text-primary">
        <Link
          to={createReviewPath(review.reviewId)}
          className="outline-none hover:text-accent-text hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-action/20"
        >
          {review.title}
        </Link>
      </h3>

      <ReviewSpoiler
        reviewId={review.reviewId}
        hidden={review.bodyState === 'spoiler-hidden'}
        content={review.excerpt}
        variant="summary"
      />

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          to={createReviewPath(review.reviewId)}
          className="inline-flex min-h-8 items-center text-sm font-semibold text-accent-text outline-none hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-action/20"
        >
          Читать полностью
        </Link>
        <span className="inline-flex items-center gap-1.5 text-caption text-text-secondary">
          <CommentIcon className="size-4" aria-hidden="true" />
          {review.commentCount}
        </span>
      </div>
    </article>
  );
}
