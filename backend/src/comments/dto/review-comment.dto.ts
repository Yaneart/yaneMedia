import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import type { ActiveAuthorDto, DeletedAuthorDto } from '../../reviews/dto/review.dto';

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
