import type { ReviewAuthorDto } from '@/entities/review';

export type ReviewCommentViewerActionsDto = {
  canEdit: boolean;
  canDelete: boolean;
  canReport: boolean;
  canModerate: boolean;
};

export type ReviewCommentDto = {
  commentId: string;
  author: ReviewAuthorDto;
  body: string;
  createdAt: string;
  updatedAt: string;
  viewerActions: ReviewCommentViewerActionsDto;
};

export type ReviewCommentPageDto = {
  items: ReviewCommentDto[];
  nextCursor: string | null;
  newerCursor: string;
};
