import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateReviewCommentDto,
  ReviewCommentCursorPageDto,
  ReviewCommentDto,
  ReviewCommentListQueryDto,
  UpdateReviewCommentDto,
} from './dto/review-comment.dto';
import type { ReviewComment } from './entities/review-comment.entity';
import {
  ReviewCommentCursorService,
  type ReviewCommentBoundary,
} from './review-comment-cursor.service';
import {
  ReviewCommentsRepository,
  type CommentAuthor,
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
    viewerCanModerate = false,
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
      items: pageRows.map((row) =>
        toReviewComment(row, viewerId, viewerCanPublish, viewerCanModerate),
      ),
      nextCursor:
        hasNextPage && last
          ? this.cursorService.encodePage(reviewId, boundaryOf(last), ceiling)
          : null,
      newerCursor: this.cursorService.encodeNewer(reviewId, ceiling),
    };
  }

  async create(
    userId: string,
    reviewId: string,
    dto: CreateReviewCommentDto,
    viewerCanModerate = false,
  ): Promise<ReviewCommentDto> {
    const author = await this.requireVerifiedAuthor(userId);
    const comment = await this.repository.create(reviewId, userId, dto.body);
    if (!comment) throwReviewNotFound();
    return toOwnedReviewComment(comment, author, viewerCanModerate);
  }

  async update(
    userId: string,
    commentId: string,
    dto: UpdateReviewCommentDto,
    viewerCanModerate = false,
  ): Promise<ReviewCommentDto> {
    const current = await this.requireOwned(commentId, userId, false);
    const expectedUpdatedAt = new Date(dto.expectedUpdatedAt);
    if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throwEditConflict();

    const comment =
      current.body === dto.body
        ? current
        : await this.repository.update(commentId, userId, expectedUpdatedAt, { body: dto.body });
    if (!comment) throwEditConflict();
    return toOwnedReviewComment(comment, await this.requireAuthor(userId), viewerCanModerate);
  }

  async delete(userId: string, commentId: string): Promise<void> {
    await this.requireOwned(commentId, userId, true);
    await this.repository.softDelete(commentId, userId);
  }

  private async requireOwned(
    commentId: string,
    userId: string,
    allowDeleted: boolean,
  ): Promise<ReviewComment> {
    const comment = await this.repository.findById(commentId);
    if (!comment || (!allowDeleted && comment.deletedAt)) {
      throwCommentNotFound();
    }
    if (comment.userId !== userId) {
      throw new ForbiddenException({
        code: 'ACTION_FORBIDDEN',
        message: 'Изменять комментарий может только его автор',
      });
    }
    return comment;
  }

  private async requireVerifiedAuthor(userId: string): Promise<CommentAuthor> {
    const author = await this.requireAuthor(userId);
    if (!author.emailVerifiedAt) {
      throw new ForbiddenException({
        code: 'EMAIL_VERIFICATION_REQUIRED',
        message: 'Подтвердите email перед публикацией',
      });
    }
    return author;
  }

  private async requireAuthor(userId: string): Promise<CommentAuthor> {
    const author = await this.repository.findViewer(userId);
    if (!author) throw new Error('Authenticated comment author was not found');
    return author;
  }
}

function toOwnedReviewComment(
  comment: ReviewComment,
  author: CommentAuthor,
  viewerCanModerate: boolean,
): ReviewCommentDto {
  return {
    commentId: comment.commentId,
    author: {
      state: 'active',
      user: {
        handle: author.handle,
        displayName: author.displayName,
        avatarUrl: author.avatarAssetId
          ? `/api/v1/profile-assets/avatar_${author.avatarAssetId}.webp`
          : null,
      },
    },
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    viewerActions: {
      canEdit: true,
      canDelete: true,
      canReport: false,
      canModerate: viewerCanModerate,
    },
  };
}

function toReviewComment(
  comment: PublicReviewCommentRow,
  viewerId: string | undefined,
  viewerCanPublish: boolean,
  viewerCanModerate: boolean,
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
      canModerate: viewerCanModerate,
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

function throwCommentNotFound(): never {
  throw new NotFoundException({ code: 'COMMENT_NOT_FOUND', message: 'Комментарий не найден' });
}

function throwEditConflict(): never {
  throw new ConflictException({
    code: 'EDIT_CONFLICT',
    message: 'Комментарий был изменён. Обновите данные и повторите попытку',
  });
}
