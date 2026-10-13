import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DrizzleQueryError } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import { MediaCatalogService } from '../media/catalog/media-catalog.service';
import type { MediaSummaryDto } from '../media/dto/media-summary.dto';
import type { PublicProfileCollectionQueryDto } from '../profile/dto/public-profile-collection-query.dto';
import { isHandleAllowed, normalizeHandle } from '../users/handle';
import type {
  CreateReviewDto,
  OwnReviewCursorPageDto,
  OwnReviewDetailDto,
  ReviewContentDto,
  ReviewCursorPageDto,
  ReviewDetailDto,
  ReviewListQueryDto,
  ReviewSummaryDto,
  UpdateReviewDto,
} from './dto/review.dto';
import type { Review } from './entities/review.entity';
import type { ReviewListSnapshot } from './entities/review-list-snapshot.entity';
import {
  ReviewsRepository,
  type PublicReviewRow,
  type ReviewAuthor,
  type ReviewChanges,
} from './reviews.repository';
import { ProfileReviewCursorService } from './profile-review-cursor.service';
import {
  REVIEW_LIST_SNAPSHOT_TTL_MS,
  ReviewListCursorService,
  throwCursorInvalid,
} from './review-list-cursor.service';

@Injectable()
export class ReviewsService {
  constructor(
    private readonly reviewsRepository: ReviewsRepository,
    private readonly mediaCatalogService: MediaCatalogService,
    private readonly cursorService: ReviewListCursorService,
    private readonly profileCursorService: ProfileReviewCursorService,
  ) {}

  async list(
    locator: string,
    query: ReviewListQueryDto,
    viewerId?: string,
    viewerCanModerate = false,
  ): Promise<ReviewCursorPageDto> {
    const media = await this.requireMedia(locator);
    const now = new Date();
    let snapshot: ReviewListSnapshot;
    let position = 0;

    if (query.cursor) {
      const decoded = this.cursorService.decode(query.cursor, media.mediaRef, query.sort);
      position = decoded.position;
      const existingSnapshot = await this.reviewsRepository.findListSnapshot(
        decoded.snapshotId,
        media.mediaRef,
        query.sort,
        now,
      );
      if (!existingSnapshot) throwCursorInvalid();
      snapshot = existingSnapshot;
    } else {
      snapshot = await this.reviewsRepository.createListSnapshot(
        media.mediaRef,
        query.sort,
        new Date(now.getTime() + REVIEW_LIST_SNAPSHOT_TTL_MS),
      );
    }

    const [rows, viewer] = await Promise.all([
      this.reviewsRepository.findPublicSnapshotPage(snapshot.id, position, query.limit + 1),
      viewerId ? this.reviewsRepository.findAuthor(viewerId) : undefined,
    ]);
    const hasNextPage = rows.length > query.limit;
    const pageRows = rows.slice(0, query.limit);
    const nextPosition = rows[query.limit]?.position;

    return {
      items: pageRows.map((row) =>
        toReviewSummary(row, media, viewerId, Boolean(viewer?.emailVerifiedAt), viewerCanModerate),
      ),
      nextCursor:
        hasNextPage && nextPosition !== undefined
          ? this.cursorService.encode(
              media.mediaRef,
              query.sort,
              { snapshotId: snapshot.id, position: nextPosition },
              snapshot.expiresAt,
            )
          : null,
    };
  }

  async create(
    userId: string,
    locator: string,
    dto: CreateReviewDto,
    viewerCanModerate = false,
  ): Promise<ReviewDetailDto> {
    const [author, media] = await Promise.all([
      this.requireVerifiedAuthor(userId),
      this.requireMedia(locator),
    ]);

    let review: Review;
    try {
      review = await this.reviewsRepository.create({
        userId,
        mediaRef: media.mediaRef,
        title: dto.title,
        body: dto.body,
        isSpoiler: dto.isSpoiler,
      });
    } catch (error: unknown) {
      const cause = error instanceof DrizzleQueryError ? error.cause : error;
      if (
        cause instanceof DatabaseError &&
        cause.code === '23505' &&
        cause.constraint === 'reviews_user_id_media_ref_active_unique'
      ) {
        throw new ConflictException({
          code: 'REVIEW_ALREADY_EXISTS',
          message: 'У вас уже есть активная рецензия на это произведение',
        });
      }
      throw error;
    }

    const rating = await this.reviewsRepository.findRating(userId, media.mediaRef);
    return toReviewDetail(review, media, author, rating, 0, viewerCanModerate);
  }

  async get(
    reviewId: string,
    viewerId?: string,
    viewerCanModerate = false,
  ): Promise<ReviewDetailDto> {
    const review = await this.reviewsRepository.findPublicById(reviewId);
    if (!review) throwReviewNotFound();

    const [media, viewer] = await Promise.all([
      this.requireMedia(review.mediaRef),
      viewerId ? this.reviewsRepository.findAuthor(viewerId) : undefined,
    ]);
    return toPublicReviewDetail(
      review,
      media,
      viewerId,
      Boolean(viewer?.emailVerifiedAt),
      viewerCanModerate,
    );
  }

  async getContent(reviewId: string): Promise<ReviewContentDto> {
    const review = await this.reviewsRepository.findPublicById(reviewId);
    if (!review) throwReviewNotFound();
    return { body: review.body };
  }

  async listProfile(
    rawHandle: string,
    query: PublicProfileCollectionQueryDto,
    viewerId?: string,
    viewerCanModerate = false,
  ): Promise<ReviewCursorPageDto> {
    const handle = normalizeHandle(rawHandle);
    const owner = isHandleAllowed(handle)
      ? await this.reviewsRepository.findPublicProfileOwner(handle)
      : undefined;
    if (!owner) throwProfileNotFound();

    const boundary = query.cursor
      ? this.profileCursorService.decode(query.cursor, owner.id)
      : undefined;
    const [rows, viewer] = await Promise.all([
      this.reviewsRepository.findPublicProfilePage(owner.id, boundary, query.limit + 1),
      viewerId ? this.reviewsRepository.findAuthor(viewerId) : undefined,
    ]);
    const hasNextPage = rows.length > query.limit;
    const pageRows = rows.slice(0, query.limit);
    const resolution = await this.mediaCatalogService.resolveMediaRefs(
      pageRows.map(({ mediaRef }) => mediaRef),
    );
    const mediaByIndex = new Map(
      resolution.matches.map(({ requestIndex, item }) => [requestIndex, item]),
    );
    const items = pageRows.map((row, index) => {
      const media = mediaByIndex.get(index);
      if (!media) throw new Error(`Canonical review media was not resolved: ${row.mediaRef}`);
      return toReviewSummary(
        row,
        media,
        viewerId,
        Boolean(viewer?.emailVerifiedAt),
        viewerCanModerate,
      );
    });
    const last = pageRows.at(-1);

    return {
      items,
      nextCursor: hasNextPage && last ? this.profileCursorService.encode(owner.id, last) : null,
    };
  }

  async listOwn(
    userId: string,
    query: PublicProfileCollectionQueryDto,
    viewerCanModerate = false,
  ): Promise<OwnReviewCursorPageDto> {
    const boundary = query.cursor
      ? this.profileCursorService.decode(query.cursor, userId)
      : undefined;
    const rows = await this.reviewsRepository.findOwnProfilePage(userId, boundary, query.limit + 1);
    const hasNextPage = rows.length > query.limit;
    const pageRows = rows.slice(0, query.limit);
    const resolution = await this.mediaCatalogService.resolveMediaRefs(
      pageRows.map(({ mediaRef }) => mediaRef),
    );
    const mediaByIndex = new Map(
      resolution.matches.map(({ requestIndex, item }) => [requestIndex, item]),
    );
    const items = pageRows.map((row, index) => {
      const media = mediaByIndex.get(index);
      if (!media) throw new Error(`Canonical review media was not resolved: ${row.mediaRef}`);
      const summary = toReviewSummary(row, media, userId, true, viewerCanModerate);
      return {
        ...summary,
        publicationState: toPublicationState(row.publicationState),
        viewerActions: {
          ...summary.viewerActions,
          canComment: row.publicationState === 'published',
        },
      };
    });
    const last = pageRows.at(-1);

    return {
      items,
      nextCursor: hasNextPage && last ? this.profileCursorService.encode(userId, last) : null,
    };
  }

  async getOwn(
    userId: string,
    reviewId: string,
    viewerCanModerate = false,
  ): Promise<OwnReviewDetailDto> {
    const review = await this.reviewsRepository.findById(reviewId);
    if (!review || review.deletedAt || review.userId !== userId) throwReviewNotFound();
    const [media, author, rating, commentCount] = await Promise.all([
      this.requireMedia(review.mediaRef),
      this.requireAuthor(userId),
      this.reviewsRepository.findRating(userId, review.mediaRef),
      this.reviewsRepository.countPublicComments(review.reviewId),
    ]);
    const detail = toReviewDetail(review, media, author, rating, commentCount, viewerCanModerate);
    return {
      ...detail,
      body: review.body,
      bodyState: 'visible',
      publicationState: toPublicationState(review.publicationState),
    };
  }

  async update(
    userId: string,
    reviewId: string,
    dto: UpdateReviewDto,
    viewerCanModerate = false,
  ): Promise<ReviewDetailDto> {
    const current = await this.requireOwned(reviewId, userId, false);
    const expectedUpdatedAt = new Date(dto.expectedUpdatedAt);
    if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throwEditConflict();

    const changes = meaningfulChanges(current, dto);
    const review =
      Object.keys(changes).length === 0
        ? current
        : await this.reviewsRepository.update(reviewId, userId, expectedUpdatedAt, changes);
    if (!review) throwEditConflict();

    const [media, author, rating, commentCount] = await Promise.all([
      this.requireMedia(review.mediaRef),
      this.requireAuthor(userId),
      this.reviewsRepository.findRating(userId, review.mediaRef),
      this.reviewsRepository.countPublicComments(review.reviewId),
    ]);
    return toReviewDetail(review, media, author, rating, commentCount, viewerCanModerate);
  }

  async delete(userId: string, reviewId: string): Promise<void> {
    await this.requireOwned(reviewId, userId, true);
    await this.reviewsRepository.softDelete(reviewId, userId);
  }

  private async requireOwned(
    reviewId: string,
    userId: string,
    allowDeleted: boolean,
  ): Promise<Review> {
    const review = await this.reviewsRepository.findById(reviewId);
    if (!review || (!allowDeleted && review.deletedAt)) throwReviewNotFound();
    if (review.userId !== userId) {
      throw new ForbiddenException({
        code: 'ACTION_FORBIDDEN',
        message: 'Изменять рецензию может только её автор',
      });
    }
    return review;
  }

  private async requireVerifiedAuthor(userId: string): Promise<ReviewAuthor> {
    const author = await this.requireAuthor(userId);
    if (!author.emailVerifiedAt) {
      throw new ForbiddenException({
        code: 'EMAIL_VERIFICATION_REQUIRED',
        message: 'Подтвердите email перед публикацией',
      });
    }
    return author;
  }

  private async requireAuthor(userId: string): Promise<ReviewAuthor> {
    const author = await this.reviewsRepository.findAuthor(userId);
    if (!author) throw new Error('Authenticated review author was not found');
    return author;
  }

  private async requireMedia(locator: string): Promise<MediaSummaryDto> {
    let resolution: Awaited<ReturnType<MediaCatalogService['resolveMediaRefs']>>;
    try {
      resolution = await this.mediaCatalogService.resolveMediaRefs([locator]);
    } catch (error: unknown) {
      if (error instanceof BadRequestException || error instanceof NotFoundException) {
        throwMediaNotFound();
      }
      throw error;
    }
    const media = resolution.matches.find(({ requestIndex }) => requestIndex === 0)?.item;
    if (!media) throwMediaNotFound();
    return media;
  }
}

function meaningfulChanges(review: Review, dto: UpdateReviewDto): ReviewChanges {
  const changes: ReviewChanges = {};
  if (dto.title !== undefined && dto.title !== review.title) changes.title = dto.title;
  if (dto.body !== undefined && dto.body !== review.body) changes.body = dto.body;
  if (dto.isSpoiler !== undefined && dto.isSpoiler !== review.isSpoiler) {
    changes.isSpoiler = dto.isSpoiler;
  }
  if (dto.title === undefined && dto.body === undefined && dto.isSpoiler === undefined) {
    throw new BadRequestException('Укажите хотя бы одно поле рецензии для изменения');
  }
  return changes;
}

function toPublicationState(state: Review['publicationState']): 'published' | 'moderation-hidden' {
  return state === 'moderation_hidden' ? 'moderation-hidden' : 'published';
}

function toReviewDetail(
  review: Review,
  media: MediaSummaryDto,
  author: ReviewAuthor,
  rating: number | null,
  commentCount = 0,
  viewerCanModerate = false,
): ReviewDetailDto {
  const spoilerHidden = review.isSpoiler;
  return {
    reviewId: review.reviewId,
    media,
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
    title: review.title,
    body: spoilerHidden ? null : review.body,
    bodyState: spoilerHidden ? 'spoiler-hidden' : 'visible',
    isSpoiler: review.isSpoiler,
    rating,
    commentCount,
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
    viewerActions: {
      canEdit: true,
      canDelete: true,
      canComment: review.publicationState === 'published',
      canReport: false,
      canModerate: viewerCanModerate,
    },
  };
}

function toReviewSummary(
  review: PublicReviewRow,
  media: MediaSummaryDto,
  viewerId: string | undefined,
  viewerCanPublish: boolean,
  viewerCanModerate: boolean,
): ReviewSummaryDto {
  const isOwner = viewerId !== undefined && review.userId === viewerId;
  return {
    reviewId: review.reviewId,
    media,
    author: toPublicAuthor(review),
    title: review.title,
    excerpt: review.isSpoiler ? null : Array.from(review.body).slice(0, 280).join(''),
    bodyState: review.isSpoiler ? 'spoiler-hidden' : 'excerpt',
    isSpoiler: review.isSpoiler,
    rating: review.rating,
    commentCount: review.commentCount ?? 0,
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
    viewerActions: {
      canEdit: isOwner,
      canDelete: isOwner,
      canComment: viewerCanPublish,
      canReport: viewerCanPublish && !isOwner,
      canModerate: viewerCanModerate,
    },
  };
}

function toPublicReviewDetail(
  review: PublicReviewRow,
  media: MediaSummaryDto,
  viewerId: string | undefined,
  viewerCanPublish: boolean,
  viewerCanModerate: boolean,
): ReviewDetailDto {
  const isOwner = viewerId !== undefined && review.userId === viewerId;
  return {
    reviewId: review.reviewId,
    media,
    author: toPublicAuthor(review),
    title: review.title,
    body: review.isSpoiler ? null : review.body,
    bodyState: review.isSpoiler ? 'spoiler-hidden' : 'visible',
    isSpoiler: review.isSpoiler,
    rating: review.rating,
    commentCount: review.commentCount ?? 0,
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
    viewerActions: {
      canEdit: isOwner,
      canDelete: isOwner,
      canComment: viewerCanPublish,
      canReport: viewerCanPublish && !isOwner,
      canModerate: viewerCanModerate,
    },
  };
}

function toPublicAuthor(review: PublicReviewRow): ReviewDetailDto['author'] {
  return review.userId && review.authorHandle && review.authorDisplayName
    ? {
        state: 'active',
        user: {
          handle: review.authorHandle,
          displayName: review.authorDisplayName,
          avatarUrl: review.authorAvatarAssetId
            ? `/api/v1/profile-assets/avatar_${review.authorAvatarAssetId}.webp`
            : null,
        },
      }
    : { state: 'deleted', label: 'Удалённый пользователь' };
}

function throwMediaNotFound(): never {
  throw new NotFoundException({ code: 'MEDIA_NOT_FOUND', message: 'Произведение не найдено' });
}

function throwReviewNotFound(): never {
  throw new NotFoundException({ code: 'REVIEW_NOT_FOUND', message: 'Рецензия не найдена' });
}

function throwProfileNotFound(): never {
  throw new NotFoundException({
    code: 'PROFILE_NOT_FOUND',
    message: 'Публичный профиль не найден',
  });
}

function throwEditConflict(): never {
  throw new ConflictException({
    code: 'EDIT_CONFLICT',
    message: 'Рецензия была изменена. Обновите данные и повторите попытку',
  });
}
