import { Transform, Type } from 'class-transformer';
import {
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
import type { ActiveAuthorDto, DeletedAuthorDto } from '../../reviews/dto/review.dto';

const COMMENT_ID_PATTERN =
  /^(?:comment|media_comment)_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const API_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const PLAIN_TEXT_PATTERN = /^[^<>]*$/u;

export class CommentIdDto {
  @IsString()
  @Matches(COMMENT_ID_PATTERN)
  commentId!: string;
}

export class CreateReviewCommentDto {
  @Transform(({ value }) => normalizeCommentBody(value))
  @IsString()
  @Length(1, 2000)
  @Matches(PLAIN_TEXT_PATTERN, { message: 'Комментарий должен содержать только обычный текст' })
  body!: string;
}

export class UpdateReviewCommentDto extends CreateReviewCommentDto {
  @IsISO8601({ strict: true })
  @Matches(API_TIMESTAMP_PATTERN)
  expectedUpdatedAt!: string;
}

export class ReviewCommentListQueryDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  cursor?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  after?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 20;
}

export class ReviewCommentViewerActionsDto {
  canEdit!: boolean;
  canDelete!: boolean;
  canReport!: boolean;
  canModerate!: boolean;
}

export class ReviewCommentDto {
  commentId!: string;
  author!: ActiveAuthorDto | DeletedAuthorDto;
  body!: string;
  createdAt!: string;
  updatedAt!: string;
  viewerActions!: ReviewCommentViewerActionsDto;
}

export class ReviewCommentCursorPageDto {
  items!: ReviewCommentDto[];
  nextCursor!: string | null;
  newerCursor!: string;
}

function normalizeCommentBody(value: unknown): unknown {
  return typeof value === 'string'
    ? value
        .replace(/\r\n?/g, '\n')
        .replace(/[^\S\n]+/gu, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    : value;
}
