import { Injectable } from '@nestjs/common';
import { and, asc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service';
import { mediaWorks } from '../media/registry/media-registry.schema';
import { users, type User } from '../users/entities/user.entity';
import type { MediaCommentBoundary } from './media-comment-cursor.service';
import { mediaComments, type MediaComment } from './entities/media-comment.entity';

export type MediaCommentAuthor = Pick<
  User,
  'avatarAssetId' | 'displayName' | 'emailVerifiedAt' | 'handle' | 'id'
>;

export interface PublicMediaCommentRow extends MediaComment {
  authorHandle: string | null;
  authorDisplayName: string | null;
  authorAvatarAssetId: string | null;
}

@Injectable()
export class MediaCommentsRepository {
  constructor(private readonly databaseService: DatabaseService) {}

  async mediaExists(mediaRef: string): Promise<boolean> {
    const [media] = await this.databaseService.db
      .select({ mediaRef: mediaWorks.mediaRef })
      .from(mediaWorks)
      .where(and(eq(mediaWorks.mediaRef, mediaRef), isNull(mediaWorks.redirectMediaRef)))
      .limit(1);
    return Boolean(media);
  }

  async findViewer(userId: string): Promise<MediaCommentAuthor | undefined> {
    const [viewer] = await this.databaseService.db
      .select({
        id: users.id,
        handle: users.handle,
        displayName: users.displayName,
        avatarAssetId: users.avatarAssetId,
        emailVerifiedAt: users.emailVerifiedAt,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    return viewer;
  }

  async create(
    mediaRef: string,
    userId: string,
    body: string,
    requestedParentId?: string,
  ): Promise<MediaComment | undefined> {
    return this.databaseService.db.transaction(async (transaction) => {
      const [media] = await transaction
        .select({ mediaRef: mediaWorks.mediaRef })
        .from(mediaWorks)
        .where(and(eq(mediaWorks.mediaRef, mediaRef), isNull(mediaWorks.redirectMediaRef)))
        .limit(1)
        .for('update');
      if (!media) return undefined;

      let parentCommentId: string | null = null;
      if (requestedParentId) {
        const [parent] = await transaction
          .select({
            commentId: mediaComments.commentId,
            parentCommentId: mediaComments.parentCommentId,
          })
          .from(mediaComments)
          .where(
            and(
              eq(mediaComments.commentId, requestedParentId),
              eq(mediaComments.mediaRef, mediaRef),
              eq(mediaComments.publicationState, 'published'),
              isNull(mediaComments.deletedAt),
            ),
          )
          .limit(1)
          .for('update');
        if (!parent) return undefined;
        parentCommentId = parent.parentCommentId ?? parent.commentId;
      }

      const now = new Date();
      const [comment] = await transaction
        .insert(mediaComments)
        .values({ mediaRef, parentCommentId, userId, body, createdAt: now, updatedAt: now })
        .returning();
      if (!comment) throw new Error('Media comment was not returned after creation');
      return comment;
    });
  }

  async findById(commentId: string): Promise<MediaComment | undefined> {
    const [comment] = await this.databaseService.db
      .select()
      .from(mediaComments)
      .where(eq(mediaComments.commentId, commentId))
      .limit(1);
    return comment;
  }

  async update(
    commentId: string,
    userId: string,
    expectedUpdatedAt: Date,
    body: string,
  ): Promise<MediaComment | undefined> {
    const [comment] = await this.databaseService.db
      .update(mediaComments)
      .set({
        body,
        updatedAt: sql`greatest(
          date_trunc('milliseconds', now()),
          ${mediaComments.updatedAt} + interval '1 millisecond'
        )`,
      })
      .where(
        and(
          eq(mediaComments.commentId, commentId),
          eq(mediaComments.userId, userId),
          isNull(mediaComments.deletedAt),
          sql`date_trunc('milliseconds', ${mediaComments.updatedAt}) = ${expectedUpdatedAt}`,
        ),
      )
      .returning();
    return comment;
  }

  async softDelete(commentId: string, userId: string): Promise<void> {
    await this.databaseService.db
      .update(mediaComments)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(mediaComments.commentId, commentId),
          eq(mediaComments.userId, userId),
          isNull(mediaComments.deletedAt),
        ),
      );
  }

  async findPublicPage(
    mediaRef: string,
    after: MediaCommentBoundary | undefined,
    limit: number,
  ): Promise<PublicMediaCommentRow[]> {
    return this.databaseService.db
      .select({
        commentId: mediaComments.commentId,
        mediaRef: mediaComments.mediaRef,
        parentCommentId: mediaComments.parentCommentId,
        userId: mediaComments.userId,
        body: mediaComments.body,
        publicationState: mediaComments.publicationState,
        deletedAt: mediaComments.deletedAt,
        createdAt: mediaComments.createdAt,
        updatedAt: mediaComments.updatedAt,
        authorHandle: users.handle,
        authorDisplayName: users.displayName,
        authorAvatarAssetId: users.avatarAssetId,
      })
      .from(mediaComments)
      .leftJoin(users, eq(users.id, mediaComments.userId))
      .where(
        and(
          eq(mediaComments.mediaRef, mediaRef),
          eq(mediaComments.publicationState, 'published'),
          or(
            isNull(mediaComments.deletedAt),
            and(
              isNull(mediaComments.parentCommentId),
              sql`exists (
                select 1 from media_comments as visible_replies
                where visible_replies.parent_comment_id = ${mediaComments.commentId}
                  and visible_replies.publication_state = 'published'
                  and visible_replies.deleted_at is null
              )`,
            ),
          ),
          or(
            isNull(mediaComments.parentCommentId),
            sql`exists (
              select 1 from media_comments as visible_roots
              where visible_roots.comment_id = ${mediaComments.parentCommentId}
                and visible_roots.publication_state = 'published'
            )`,
          ),
          after
            ? or(
                gt(mediaComments.createdAt, after.createdAt),
                and(
                  eq(mediaComments.createdAt, after.createdAt),
                  gt(mediaComments.commentId, after.commentId),
                ),
              )
            : undefined,
        ),
      )
      .orderBy(asc(mediaComments.createdAt), asc(mediaComments.commentId))
      .limit(limit);
  }
}
