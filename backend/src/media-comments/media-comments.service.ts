import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateMediaCommentDto,
  MediaCommentCursorPageDto,
  MediaCommentDto,
  MediaCommentListQueryDto,
  UpdateMediaCommentDto,
} from './dto/media-comment.dto';
import type { MediaComment } from './entities/media-comment.entity';
import { MediaCommentCursorService } from './media-comment-cursor.service';
import {
  MediaCommentsRepository,
  type MediaCommentAuthor,
  type PublicMediaCommentRow,
} from './media-comments.repository';

@Injectable()
export class MediaCommentsService {
  constructor(
    private readonly repository: MediaCommentsRepository,
    private readonly cursorService: MediaCommentCursorService,
  ) {}

  async list(
    mediaRef: string,
    query: MediaCommentListQueryDto,
    viewerId?: string,
    viewerCanModerate = false,
  ): Promise<MediaCommentCursorPageDto> {
    if (!(await this.repository.mediaExists(mediaRef))) throwMediaNotFound();
    const after = query.cursor ? this.cursorService.decode(query.cursor, mediaRef) : undefined;
    const viewer = viewerId ? await this.repository.findViewer(viewerId) : undefined;
    const rows = await this.repository.findPublicPage(mediaRef, after, query.limit + 1);
    const hasNextPage = rows.length > query.limit;
    const pageRows = rows.slice(0, query.limit);
    const last = pageRows.at(-1);
    const viewerCanPublish = Boolean(viewer?.emailVerifiedAt);

    return {
      items: pageRows.map((row) =>
        toMediaComment(row, viewerId, viewerCanPublish, viewerCanModerate),
      ),
      nextCursor:
        hasNextPage && last
          ? this.cursorService.encode(mediaRef, {
              createdAt: last.createdAt,
              commentId: last.commentId,
            })
          : null,
    };
  }

  async create(
    userId: string,
    mediaRef: string,
    dto: CreateMediaCommentDto,
    viewerCanModerate = false,
  ): Promise<MediaCommentDto> {
    const author = await this.requireVerifiedAuthor(userId);
    if (!(await this.repository.mediaExists(mediaRef))) throwMediaNotFound();
    const comment = await this.repository.create(mediaRef, userId, dto.body, dto.parentCommentId);
    if (!comment) throwParentNotFound();
    return toOwnedMediaComment(comment, author, viewerCanModerate);
  }

  async update(
    userId: string,
    commentId: string,
    dto: UpdateMediaCommentDto,
    viewerCanModerate = false,
  ): Promise<MediaCommentDto> {
    const current = await this.requireOwned(commentId, userId, false);
    const expectedUpdatedAt = new Date(dto.expectedUpdatedAt);
    if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throwEditConflict();

    const comment =
      current.body === dto.body
        ? current
        : await this.repository.update(commentId, userId, expectedUpdatedAt, dto.body);
    if (!comment) throwEditConflict();
    return toOwnedMediaComment(comment, await this.requireAuthor(userId), viewerCanModerate);
  }

  async delete(userId: string, commentId: string): Promise<void> {
    await this.requireOwned(commentId, userId, true);
    await this.repository.softDelete(commentId, userId);
  }

  private async requireOwned(
    commentId: string,
    userId: string,
    allowDeleted: boolean,
  ): Promise<MediaComment> {
    const comment = await this.repository.findById(commentId);
    if (!comment || (!allowDeleted && comment.deletedAt)) throwCommentNotFound();
    if (comment.userId !== userId) {
      throw new ForbiddenException({
        code: 'ACTION_FORBIDDEN',
        message: 'Изменять комментарий может только его автор',
      });
    }
    return comment;
  }

  private async requireVerifiedAuthor(userId: string): Promise<MediaCommentAuthor> {
    const author = await this.requireAuthor(userId);
    if (!author.emailVerifiedAt) {
      throw new ForbiddenException({
        code: 'EMAIL_VERIFICATION_REQUIRED',
        message: 'Подтвердите email перед публикацией',
      });
    }
    return author;
  }

  private async requireAuthor(userId: string): Promise<MediaCommentAuthor> {
    const author = await this.repository.findViewer(userId);
    if (!author) throw new Error('Authenticated media comment author was not found');
    return author;
  }
}

function toOwnedMediaComment(
  comment: MediaComment,
  author: MediaCommentAuthor,
  viewerCanModerate: boolean,
): MediaCommentDto {
  return {
    commentId: comment.commentId,
    parentCommentId: comment.parentCommentId,
    deleted: false,
    author: activeAuthor(author),
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    viewerActions: {
      canEdit: true,
      canDelete: true,
      canReply: true,
      canReport: false,
      canModerate: viewerCanModerate,
    },
  };
}

function toMediaComment(
  comment: PublicMediaCommentRow,
  viewerId: string | undefined,
  viewerCanPublish: boolean,
  viewerCanModerate: boolean,
): MediaCommentDto {
  const isOwner = viewerId !== undefined && comment.userId === viewerId;
  const isDeleted = comment.deletedAt !== null;
  return {
    commentId: comment.commentId,
    parentCommentId: comment.parentCommentId,
    deleted: isDeleted,
    author:
      !isDeleted && comment.userId && comment.authorHandle && comment.authorDisplayName
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
        : {
            state: 'deleted',
            label: 'Удалённый пользователь',
          },
    body: isDeleted ? '' : comment.body,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    viewerActions: {
      canEdit: !isDeleted && isOwner,
      canDelete: !isDeleted && isOwner,
      canReply: !isDeleted && viewerCanPublish,
      canReport: !isDeleted && viewerCanPublish && !isOwner,
      canModerate: !isDeleted && viewerCanModerate,
    },
  };
}

function activeAuthor(author: MediaCommentAuthor): MediaCommentDto['author'] {
  return {
    state: 'active',
    user: {
      handle: author.handle,
      displayName: author.displayName,
      avatarUrl: author.avatarAssetId
        ? `/api/v1/profile-assets/avatar_${author.avatarAssetId}.webp`
        : null,
    },
  };
}

function throwMediaNotFound(): never {
  throw new NotFoundException({ code: 'MEDIA_NOT_FOUND', message: 'Произведение не найдено' });
}

function throwParentNotFound(): never {
  throw new NotFoundException({
    code: 'COMMENT_NOT_FOUND',
    message: 'Комментарий, на который вы отвечаете, не найден',
  });
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
