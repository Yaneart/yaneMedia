import type { MediaSummary } from '@/entities/media';
import type { CursorPage } from '@/shared/api';

const reviewIdPattern =
  /^review_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function isReviewId(value: unknown): value is string {
  return typeof value === 'string' && reviewIdPattern.test(value);
}

export type ReviewAuthor =
  | {
      state: 'active';
      user: { handle: string; displayName: string; avatarUrl: string | null };
    }
  | { state: 'deleted'; label: string };

export type ReviewViewerActions = {
  canEdit: boolean;
  canDelete: boolean;
  canComment: boolean;
  canReport: boolean;
  canModerate: boolean;
};

type ReviewBase = {
  reviewId: string;
  media: MediaSummary;
  author: ReviewAuthor;
  title: string;
  isSpoiler: boolean;
  rating: number | null;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
  viewerActions: ReviewViewerActions;
};

export type ReviewSummary = ReviewBase & {
  excerpt: string | null;
  bodyState: 'excerpt' | 'spoiler-hidden';
};

export type ReviewDetail = ReviewBase & {
  body: string | null;
  bodyState: 'visible' | 'spoiler-hidden';
};

export type OwnReviewSummary = ReviewSummary & {
  publicationState: 'published' | 'moderation-hidden';
};

export type OwnReviewDetail = Omit<ReviewDetail, 'body' | 'bodyState'> & {
  body: string;
  bodyState: 'visible';
  publicationState: 'published' | 'moderation-hidden';
};

export type ReviewPage = CursorPage<ReviewSummary>;
export type OwnReviewPage = CursorPage<OwnReviewSummary>;
export type ReviewSort = 'new' | 'updated' | 'rating-high' | 'rating-low';

export type ReviewDraft = {
  title: string;
  body: string;
  isSpoiler: boolean;
};

export type UpdateReviewDraft = ReviewDraft & { expectedUpdatedAt: string };
