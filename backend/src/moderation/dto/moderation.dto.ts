import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export const REPORT_REASONS = [
  'spam',
  'abuse',
  'hate',
  'sexual_content',
  'violence',
  'spoiler',
  'other',
] as const;
export const ADMIN_REPORT_STATUSES = ['open', 'resolved', 'rejected', 'all'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
export type AdminReportStatus = (typeof ADMIN_REPORT_STATUSES)[number];

const REVIEW_ID_PATTERN =
  /^review_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const COMMENT_ID_PATTERN =
  /^(?:comment|media_comment)_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REPORT_ID_PATTERN =
  /^report_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const PLAIN_TEXT_PATTERN = /^[^<>]*$/u;

export class ReportTargetDto {
  @IsIn(['review', 'comment'])
  type!: 'review' | 'comment';

  @IsOptional()
  @IsString()
  @Matches(REVIEW_ID_PATTERN)
  reviewId?: string;

  @IsOptional()
  @IsString()
  @Matches(COMMENT_ID_PATTERN)
  commentId?: string;
}

export class CreateReportDto {
  @ValidateNested()
  @Type(() => ReportTargetDto)
  target!: ReportTargetDto;

  @IsIn(REPORT_REASONS)
  reason!: ReportReason;

  @ValidateIf((object: CreateReportDto) => object.reason === 'other' || object.note !== undefined)
  @Transform(({ value }) => normalizePlainText(value))
  @IsString()
  @Length(1, 1000)
  @Matches(PLAIN_TEXT_PATTERN, { message: 'Пояснение должно содержать только обычный текст' })
  note?: string;
}

export class ModerationDecisionDto {
  @Transform(({ value }) => normalizePlainText(value))
  @IsString()
  @Length(1, 1000)
  @Matches(PLAIN_TEXT_PATTERN, { message: 'Решение должно содержать только обычный текст' })
  decision!: string;
}

export class ReportIdDto {
  @IsString()
  @Matches(REPORT_ID_PATTERN)
  reportId!: string;
}

export class AdminReportListQueryDto {
  @IsOptional()
  @IsIn(ADMIN_REPORT_STATUSES)
  status: AdminReportStatus = 'open';

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

export class ReportReceiptDto {
  reportId!: string;
  status!: 'received';
  createdAt!: string;
}

export interface AdminReportDto {
  reportId: string;
  reporterUserId: string | null;
  target: { type: 'review'; reviewId: string } | { type: 'comment'; commentId: string };
  reason: ReportReason;
  note: string | null;
  status: 'open' | 'resolved' | 'rejected';
  decision: string | null;
  decidedByUserId: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminReportCursorPageDto {
  items: AdminReportDto[];
  nextCursor: string | null;
}

function normalizePlainText(value: unknown): unknown {
  return typeof value === 'string'
    ? value
        .replace(/\r\n?/g, '\n')
        .replace(/[^\S\n]+/gu, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    : value;
}
