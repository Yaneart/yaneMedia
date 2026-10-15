import type { ReviewAuthor } from '@/entities/review';

export type MediaComment = {
  commentId: string;
  parentCommentId: string | null;
  deleted: boolean;
  author: ReviewAuthor;
  body: string;
  createdAt: string;
  updatedAt: string;
  viewerActions: {
    canEdit: boolean;
    canDelete: boolean;
    canReply: boolean;
    canReport: boolean;
    canModerate: boolean;
  };
};

export type MediaCommentPage = {
  items: MediaComment[];
  nextCursor: string | null;
};
