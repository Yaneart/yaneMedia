import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type {
  ReviewCommentCursorPageDto,
  ReviewCommentDto,
  ReviewCommentListQueryDto,
} from './dto/review-comment.dto';
import {
  ReviewCommentCursorService,
  type ReviewCommentBoundary,
} from './review-comment-cursor.service';
import {
  ReviewCommentsRepository,
  type PublicReviewCommentRow,
} from './review-comments.repository';

@Injectable()
export class ReviewCommentsService {
  constructor(
    private readonly repository: ReviewCommentsRepository,
    private readonly cursorService: ReviewCommentCursorService,
  ) {}

  async list(
    reviewId: string,
    query: ReviewCommentListQueryDto,
    viewerId?: string,
  ): Promise<ReviewCommentCursorPageDto> {
    if (query.cursor && query.after) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Параметры cursor и after нельзя использовать одновременно',
      });
    }
    if (!(await this.repository.publicReviewExists(reviewId))) throwReviewNotFound();

    const pageCursor = query.cursor
      ? this.cursorService.decodePage(query.cursor, reviewId)
      : undefined;
    const after = query.after
      ? this.cursorService.decodeNewer(query.after, reviewId)
      : (pageCursor?.after ?? null);
    const ceiling =
      pageCursor?.ceiling ?? (await this.repository.findLatestPublicBoundary(reviewId)) ?? null;
    const viewer = viewerId ? await this.repository.findViewer(viewerId) : undefined;

    if (!ceiling || (after && compareBoundaries(after, ceiling) >= 0)) {
      return {
        items: [],
        nextCursor: null,
        newerCursor: this.cursorService.encodeNewer(reviewId, ceiling ?? after),
      };
    }

    const rows = await this.repository.findPublicPage(reviewId, after, ceiling, query.limit + 1);
    const hasNextPage = rows.length > query.limit;
    const pageRows = rows.slice(0, query.limit);
    const last = pageRows.at(-1);
    const viewerCanPublish = Boolean(viewer?.emailVerifiedAt);

    return {
      items: pageRows.map((row) => toReviewComment(row, viewerId, viewerCanPublish)),
      nextCursor:
        hasNextPage && last
          ? this.cursorService.encodePage(reviewId, boundaryOf(last), ceiling)
          : null,
      newerCursor: this.cursorService.encodeNewer(reviewId, ceiling),
    };
  }
}

function toReviewComment(
  comment: PublicReviewCommentRow,
  viewerId: string | undefined,
  viewerCanPublish: boolean,
): ReviewCommentDto {
  const isOwner = viewerId !== undefined && comment.userId === viewerId;
  return {
    commentId: comment.commentId,
    author:
      comment.userId && comment.authorHandle && comment.authorDisplayName
        ? {
            state: 'active',
            user: {
              handle: comment.authorHandle,
              displayName: comment.authorDisplayName,
              avatarUrl: comment.authorAvatarAssetId
                ? `/api/v1/profile-assets/avatar_${comment.authorAvatarAssetId}.webp`
                : null,
            },
          }
        : { state: 'deleted', label: 'Удалённый пользователь' },
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    viewerActions: {
      canEdit: isOwner,
      canDelete: isOwner,
      canReport: viewerCanPublish && !isOwner,
      canModerate: false,
    },
  };
}

function boundaryOf(comment: Pick<PublicReviewCommentRow, 'commentId' | 'createdAt'>) {
  return { commentId: comment.commentId, createdAt: comment.createdAt };
}

function compareBoundaries(left: ReviewCommentBoundary, right: ReviewCommentBoundary): number {
  return (
    left.createdAt.getTime() - right.createdAt.getTime() ||
    left.commentId.localeCompare(right.commentId)
  );
}

function throwReviewNotFound(): never {
  throw new NotFoundException({ code: 'REVIEW_NOT_FOUND', message: 'Рецензия не найдена' });
}
