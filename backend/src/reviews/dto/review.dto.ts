import { Transform } from 'class-transformer';
import { IsBoolean, IsISO8601, IsOptional, IsString, Length, Matches } from 'class-validator';
import type { MediaSummaryDto } from '../../media/dto/media-summary.dto';
import { MEDIA_REF_PATTERN } from '../../media/media-ref';

const REVIEW_ID_PATTERN =
  /^review_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const API_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

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

export class CreateReviewDto {
  @Transform(({ value }) => normalizeTitle(value))
  @IsString()
  @Length(1, 120)
  title!: string;

  @Transform(({ value }) => normalizeBody(value))
  @IsString()
  @Length(20, 10_000)
  body!: string;

  @IsBoolean()
  isSpoiler!: boolean;
}

export class UpdateReviewDto {
  @IsOptional()
  @Transform(({ value }) => normalizeTitle(value))
  @IsString()
  @Length(1, 120)
  title?: string;

  @IsOptional()
  @Transform(({ value }) => normalizeBody(value))
  @IsString()
  @Length(20, 10_000)
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
  author!: ActiveAuthorDto;
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

function normalizeTitle(value: unknown): unknown {
  return typeof value === 'string' ? value.replace(/\s+/gu, ' ').trim() : value;
}

function normalizeBody(value: unknown): unknown {
  return typeof value === 'string' ? value.replace(/\r\n?/g, '\n').trim() : value;
}
