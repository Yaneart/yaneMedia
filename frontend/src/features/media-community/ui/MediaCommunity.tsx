import { useState } from 'react';

import type { MediaSummary } from '@/entities/media';
import { MediaComments } from '@/features/media-comments';
import { MediaReviews } from '@/features/media-reviews';
import { ReviewEditor } from '@/features/review-editor';

type CommunityTab = 'comments' | 'reviews';

export function MediaCommunity({ media }: { media: MediaSummary }) {
  const [tab, setTab] = useState<CommunityTab>('comments');
  const [reviewsVisited, setReviewsVisited] = useState(false);
  const selectTab = (next: CommunityTab) => {
    if (next === 'reviews') setReviewsVisited(true);
    setTab(next);
  };

  return (
    <section aria-label="Мнения о произведении" className="order-6 min-w-0 xl:col-span-2">
      <div
        role="tablist"
        aria-label="Обсуждение и рецензии"
        className="mb-3 inline-flex rounded-control border border-border bg-surface p-1"
      >
        {(
          [
            ['comments', 'Комментарии'],
            ['reviews', 'Рецензии'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`media-community-${value}-tab`}
            aria-selected={tab === value}
            aria-controls={`media-community-${value}-panel`}
            tabIndex={tab === value ? 0 : -1}
            onClick={() => selectTab(value)}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
              event.preventDefault();
              const next = value === 'comments' ? 'reviews' : 'comments';
              selectTab(next);
              requestAnimationFrame(() =>
                document.getElementById(`media-community-${next}-tab`)?.focus(),
              );
            }}
            className={`min-h-10 rounded-control px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20 ${
              tab === value
                ? 'bg-action text-action-text shadow-sm'
                : 'text-text-secondary hover:bg-control-hover hover:text-text-primary'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        id="media-community-comments-panel"
        role="tabpanel"
        aria-labelledby="media-community-comments-tab"
        hidden={tab !== 'comments'}
      >
        <MediaComments media={media} />
      </div>
      <div
        id="media-community-reviews-panel"
        role="tabpanel"
        aria-labelledby="media-community-reviews-tab"
        hidden={tab !== 'reviews'}
        className="space-y-3"
      >
        {reviewsVisited && (
          <>
            <ReviewEditor media={media} />
            <MediaReviews media={media} />
          </>
        )}
      </div>
    </section>
  );
}
