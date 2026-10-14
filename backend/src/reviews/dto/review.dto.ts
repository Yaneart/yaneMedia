import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import type { MediaSummaryDto } from '../../media/dto/media-summary.dto';
import { MEDIA_REF_PATTERN } from '../../media/media-ref';

const REVIEW_ID_PATTERN =
  /^review_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const API_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const PLAIN_TEXT_PATTERN = /^[^<>]*$/u;

export class ReviewMediaRefDto {
  @IsString()
  @Matches(MEDIA_REF_PATTERN)
  mediaRef!: string;
}

export class ReviewIdDto {
  @IsString()
  @Matches(REVIEW_ID_PATTERN)
  reviewId!: string;
}

export const REVIEW_SORTS = ['new', 'updated', 'rating-high', 'rating-low'] as const;
export type ReviewSort = (typeof REVIEW_SORTS)[number];

export class ReviewListQueryDto {
  @IsOptional()
  @IsIn(REVIEW_SORTS)
  sort: ReviewSort = 'new';

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  cursor?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}

export class CreateReviewDto {
  @Transform(({ value }) => normalizeTitle(value))
  @IsString()
  @Length(1, 120)
  @Matches(PLAIN_TEXT_PATTERN)
  title!: string;

  @Transform(({ value }) => normalizeBody(value))
  @IsString()
  @Length(20, 10_000)
  @Matches(PLAIN_TEXT_PATTERN)
  body!: string;

  @IsBoolean()
  isSpoiler!: boolean;
}

export class UpdateReviewDto {
  @IsOptional()
  @Transform(({ value }) => normalizeTitle(value))
  @IsString()
  @Length(1, 120)
  @Matches(PLAIN_TEXT_PATTERN)
  title?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeBody(value))
  @IsString()
  @Length(20, 10_000)
  @Matches(PLAIN_TEXT_PATTERN)
  body?: string;

  @IsOptional()
  @IsBoolean()
  isSpoiler?: boolean;

  @IsISO8601({ strict: true })
  @Matches(API_TIMESTAMP_PATTERN)
  expectedUpdatedAt!: string;
}

export class ActiveAuthorDto {
  state!: 'active';
  user!: {
    handle: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export class DeletedAuthorDto {
  state!: 'deleted';
  label!: 'Удалённый пользователь';
}

export class ViewerActionsDto {
  canEdit!: boolean;
  canDelete!: boolean;
  canComment!: boolean;
  canReport!: boolean;
  canModerate!: boolean;
}

export class ReviewDetailDto {
  reviewId!: string;
  media!: MediaSummaryDto;
  author!: ActiveAuthorDto | DeletedAuthorDto;
  title!: string;
  body!: string | null;
  bodyState!: 'visible' | 'spoiler-hidden';
  isSpoiler!: boolean;
  rating!: number | null;
  commentCount!: number;
  createdAt!: string;
  updatedAt!: string;
  viewerActions!: ViewerActionsDto;
}

export class ReviewSummaryDto {
  reviewId!: string;
  media!: MediaSummaryDto;
  author!: ActiveAuthorDto | DeletedAuthorDto;
  title!: string;
  excerpt!: string | null;
  bodyState!: 'excerpt' | 'spoiler-hidden';
  isSpoiler!: boolean;
  rating!: number | null;
  commentCount!: number;
  createdAt!: string;
  updatedAt!: string;
  viewerActions!: ViewerActionsDto;
}

export class ReviewCursorPageDto {
  items!: ReviewSummaryDto[];
  nextCursor!: string | null;
}

export class OwnReviewSummaryDto extends ReviewSummaryDto {
  publicationState!: 'published' | 'moderation-hidden';
}

export class OwnReviewDetailDto extends ReviewDetailDto {
  declare body: string;
  declare bodyState: 'visible';
  publicationState!: 'published' | 'moderation-hidden';
}

export class OwnReviewResponseDto {
  review!: OwnReviewDetailDto | null;
}

export class OwnReviewCursorPageDto {
  items!: OwnReviewSummaryDto[];
  nextCursor!: string | null;
}

export class ReviewContentDto {
  body!: string;
}

function normalizeTitle(value: unknown): unknown {
  return typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : value;
}

function normalizeBody(value: unknown): unknown {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : value;
}
