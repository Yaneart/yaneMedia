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

const CANONICAL_MEDIA_REF_PATTERN =
  /^work_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MEDIA_COMMENT_ID_PATTERN =
  /^media_comment_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const API_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const PLAIN_TEXT_PATTERN = /^[^<>]*$/u;

export class MediaCommentsMediaRefDto {
  @IsString()
  @Matches(CANONICAL_MEDIA_REF_PATTERN)
  mediaRef!: string;
}

export class MediaCommentIdDto {
  @IsString()
  @Matches(MEDIA_COMMENT_ID_PATTERN)
  commentId!: string;
}

export class CreateMediaCommentDto {
  @Transform(({ value }) => normalizeCommentBody(value))
  @IsString()
  @Length(1, 2000)
  @Matches(PLAIN_TEXT_PATTERN, {
    message: 'Комментарий должен содержать только обычный текст',
  })
  body!: string;

  @IsOptional()
  @IsString()
  @Matches(MEDIA_COMMENT_ID_PATTERN)
  parentCommentId?: string;
}

export class UpdateMediaCommentDto {
  @Transform(({ value }) => normalizeCommentBody(value))
  @IsString()
  @Length(1, 2000)
  @Matches(PLAIN_TEXT_PATTERN, {
    message: 'Комментарий должен содержать только обычный текст',
  })
  body!: string;

  @IsISO8601({ strict: true })
  @Matches(API_TIMESTAMP_PATTERN)
  expectedUpdatedAt!: string;
}

export class MediaCommentListQueryDto {
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

export class MediaCommentViewerActionsDto {
  canEdit!: boolean;
  canDelete!: boolean;
  canReply!: boolean;
  canReport!: boolean;
  canModerate!: boolean;
}

export class MediaCommentDto {
  commentId!: string;
  parentCommentId!: string | null;
  deleted!: boolean;
  author!: ActiveAuthorDto | DeletedAuthorDto;
  body!: string;
  createdAt!: string;
  updatedAt!: string;
  viewerActions!: MediaCommentViewerActionsDto;
}

export class MediaCommentCursorPageDto {
  items!: MediaCommentDto[];
  nextCursor!: string | null;
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
