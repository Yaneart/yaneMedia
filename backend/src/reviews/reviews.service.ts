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
import type {
  CreateReviewDto,
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
  type PublicReviewPageRow,
  type ReviewAuthor,
  type ReviewChanges,
} from './reviews.repository';
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
  ) {}

  async list(
    locator: string,
    query: ReviewListQueryDto,
    viewerId?: string,
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
        toReviewSummary(row, media, viewerId, Boolean(viewer?.emailVerifiedAt)),
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

  async create(userId: string, locator: string, dto: CreateReviewDto): Promise<ReviewDetailDto> {
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
    return toReviewDetail(review, media, author, rating);
  }

  async update(userId: string, reviewId: string, dto: UpdateReviewDto): Promise<ReviewDetailDto> {
    const current = await this.requireOwned(reviewId, userId, false);
    const expectedUpdatedAt = new Date(dto.expectedUpdatedAt);
    if (current.updatedAt.getTime() !== expectedUpdatedAt.getTime()) throwEditConflict();

    const changes = meaningfulChanges(current, dto);
    const review =
      Object.keys(changes).length === 0
        ? current
        : await this.reviewsRepository.update(reviewId, userId, expectedUpdatedAt, changes);
    if (!review) throwEditConflict();

    const [media, author, rating] = await Promise.all([
      this.requireMedia(review.mediaRef),
      this.requireAuthor(userId),
      this.reviewsRepository.findRating(userId, review.mediaRef),
    ]);
    return toReviewDetail(review, media, author, rating);
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

function toReviewDetail(
  review: Review,
  media: MediaSummaryDto,
  author: ReviewAuthor,
  rating: number | null,
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
    commentCount: 0,
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
    viewerActions: {
      canEdit: true,
      canDelete: true,
      canComment: review.publicationState === 'published',
      canReport: false,
      canModerate: false,
    },
  };
}

function toReviewSummary(
  review: PublicReviewPageRow,
  media: MediaSummaryDto,
  viewerId: string | undefined,
  viewerCanPublish: boolean,
): ReviewSummaryDto {
  const isOwner = viewerId !== undefined && review.userId === viewerId;
  const activeAuthor =
    review.userId && review.authorHandle && review.authorDisplayName
      ? {
          state: 'active' as const,
          user: {
            handle: review.authorHandle,
            displayName: review.authorDisplayName,
            avatarUrl: review.authorAvatarAssetId
              ? `/api/v1/profile-assets/avatar_${review.authorAvatarAssetId}.webp`
              : null,
          },
        }
      : { state: 'deleted' as const, label: 'Удалённый пользователь' as const };

  return {
    reviewId: review.reviewId,
    media,
    author: activeAuthor,
    title: review.title,
    excerpt: review.isSpoiler ? null : Array.from(review.body).slice(0, 280).join(''),
    bodyState: review.isSpoiler ? 'spoiler-hidden' : 'excerpt',
    isSpoiler: review.isSpoiler,
    rating: review.rating,
    commentCount: 0,
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
    viewerActions: {
      canEdit: isOwner,
      canDelete: isOwner,
      canComment: viewerCanPublish,
      canReport: viewerCanPublish && !isOwner,
      canModerate: false,
    },
  };
}

function throwMediaNotFound(): never {
  throw new NotFoundException({ code: 'MEDIA_NOT_FOUND', message: 'Произведение не найдено' });
}

function throwReviewNotFound(): never {
  throw new NotFoundException({ code: 'REVIEW_NOT_FOUND', message: 'Рецензия не найдена' });
}

function throwEditConflict(): never {
  throw new ConflictException({
    code: 'EDIT_CONFLICT',
    message: 'Рецензия была изменена. Обновите данные и повторите попытку',
  });
}
