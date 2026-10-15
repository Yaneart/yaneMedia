import type { ReviewAuthorDto } from '@/entities/review';

export type MediaCommentDto = {
  commentId: string;
  parentCommentId: string | null;
  deleted: boolean;
  author: ReviewAuthorDto;
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

export type MediaCommentPageDto = {
  items: MediaCommentDto[];
  nextCursor: string | null;
};
