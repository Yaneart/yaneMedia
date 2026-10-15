import type { MediaSummaryDto } from '@/entities/media';
import type { CursorPageDto } from '@/shared/api';

export type ActiveReviewAuthorDto = {
  state: 'active';
  user: { handle: string; displayName: string; avatarUrl: string | null };
};

export type DeletedReviewAuthorDto = {
  state: 'deleted';
  label: string;
};

export type ReviewAuthorDto = ActiveReviewAuthorDto | DeletedReviewAuthorDto;

export type ReviewViewerActionsDto = {
  canEdit: boolean;
  canDelete: boolean;
  canComment: boolean;
  canReport: boolean;
  canModerate: boolean;
};

type ReviewBaseDto = {
  reviewId: string;
  media: MediaSummaryDto;
  author: ReviewAuthorDto;
  title: string;
  isSpoiler: boolean;
  rating: number | null;
  commentCount: number;
  createdAt: string;
  updatedAt: string;
  viewerActions: ReviewViewerActionsDto;
};

export type ReviewSummaryDto = ReviewBaseDto & {
  excerpt: string | null;
  bodyState: 'excerpt' | 'spoiler-hidden';
};

export type ReviewDetailDto = ReviewBaseDto & {
  body: string | null;
  bodyState: 'visible' | 'spoiler-hidden';
};

export type OwnReviewSummaryDto = ReviewSummaryDto & {
  publicationState: 'published' | 'moderation-hidden';
};

export type OwnReviewDetailDto = Omit<ReviewDetailDto, 'body' | 'bodyState'> & {
  body: string;
  bodyState: 'visible';
  publicationState: 'published' | 'moderation-hidden';
};

export type OwnReviewResponseDto = { review: OwnReviewDetailDto | null };

export type ReviewPageDto = CursorPageDto<ReviewSummaryDto>;
export type OwnReviewPageDto = CursorPageDto<OwnReviewSummaryDto>;
export type ReviewContentDto = { body: string };
export type ReviewSort = 'new' | 'updated' | 'rating-high' | 'rating-low';
