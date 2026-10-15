import type { ReviewAuthor } from '@/entities/review';

export type ReviewCommentViewerActions = {
  canEdit: boolean;
  canDelete: boolean;
  canReport: boolean;
  canModerate: boolean;
};

export type ReviewComment = {
  commentId: string;
  author: ReviewAuthor;
  body: string;
  createdAt: string;
  updatedAt: string;
  viewerActions: ReviewCommentViewerActions;
};

export type ReviewCommentPage = {
  items: ReviewComment[];
  nextCursor: string | null;
  newerCursor: string;
};
