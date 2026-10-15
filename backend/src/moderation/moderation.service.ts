import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DrizzleQueryError } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import type {
  AdminReportCursorPageDto,
  AdminReportDto,
  AdminReportListQueryDto,
  CreateReportDto,
  ModerationDecisionDto,
  ReportReceiptDto,
} from './dto/moderation.dto';
import type { ContentReport } from './entities/moderation.entity';
import { ModerationRepository } from './moderation.repository';
import { ReportCursorService } from './report-cursor.service';

@Injectable()
export class ModerationService {
  constructor(
    private readonly repository: ModerationRepository,
    private readonly cursorService: ReportCursorService,
  ) {}

  async createReport(userId: string, dto: CreateReportDto): Promise<ReportReceiptDto> {
    const reporter = await this.repository.findReporter(userId);
    if (!reporter) throw new Error('Authenticated report author was not found');
    if (!reporter.emailVerifiedAt) {
      throw new ForbiddenException({
        code: 'EMAIL_VERIFICATION_REQUIRED',
        message: 'Подтвердите email перед отправкой жалобы',
      });
    }
    const target = parseTarget(dto);
    if (dto.reason === 'other' && !dto.note) {
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Для причины «Другое» укажите пояснение',
      });
    }

    try {
      const result = await this.repository.createReport({
        reporterUserId: userId,
        targetType: target.type,
        targetId: target.id,
        reason: dto.reason,
        note: dto.note,
      });
      if (result.state === 'missing') throwTargetNotFound(target.type);
      if (result.state === 'own') {
        throw new ForbiddenException({
          code: 'ACTION_FORBIDDEN',
          message: 'Нельзя жаловаться на собственный контент',
        });
      }
      return {
        reportId: result.report.reportId,
        status: 'received',
        createdAt: result.report.createdAt.toISOString(),
      };
    } catch (error: unknown) {
      const cause = error instanceof DrizzleQueryError ? error.cause : error;
      if (
        cause instanceof DatabaseError &&
        cause.code === '23505' &&
        cause.constraint === 'content_reports_reporter_target_open_unique'
      ) {
        throw new ConflictException({
          code: 'REPORT_ALREADY_EXISTS',
          message: 'Вы уже отправили активную жалобу на этот контент',
        });
      }
      throw error;
    }
  }

  async listReports(query: AdminReportListQueryDto): Promise<AdminReportCursorPageDto> {
    const boundary = query.cursor
      ? this.cursorService.decode(query.cursor, query.status)
      : undefined;
    const rows = await this.repository.findReports(query.status, boundary, query.limit + 1);
    const hasNextPage = rows.length > query.limit;
    const pageRows = rows.slice(0, query.limit);
    const last = pageRows.at(-1);
    return {
      items: pageRows.map(toAdminReport),
      nextCursor:
        hasNextPage && last
          ? this.cursorService.encode(query.status, {
              createdAt: last.createdAt,
              reportId: last.reportId,
            })
          : null,
    };
  }

  async setReviewVisibility(
    administratorUserId: string,
    reviewId: string,
    visible: boolean,
    dto: ModerationDecisionDto,
  ): Promise<void> {
    if (
      !(await this.repository.setReviewVisibility(
        reviewId,
        administratorUserId,
        visible ? 'published' : 'moderation_hidden',
        dto.decision,
      ))
    ) {
      throwTargetNotFound('review');
    }
  }

  async setCommentVisibility(
    administratorUserId: string,
    commentId: string,
    visible: boolean,
    dto: ModerationDecisionDto,
  ): Promise<void> {
    if (
      !(await this.repository.setCommentVisibility(
        commentId,
        administratorUserId,
        visible ? 'published' : 'moderation_hidden',
        dto.decision,
      ))
    ) {
      throwTargetNotFound('comment');
    }
  }

  async decideReport(
    administratorUserId: string,
    reportId: string,
    status: 'resolved' | 'rejected',
    dto: ModerationDecisionDto,
  ): Promise<void> {
    if (
      !(await this.repository.decideReport(reportId, administratorUserId, status, dto.decision))
    ) {
      throw new NotFoundException({ code: 'REPORT_NOT_FOUND', message: 'Жалоба не найдена' });
    }
  }
}

function parseTarget(dto: CreateReportDto): { type: 'review' | 'comment'; id: string } {
  if (dto.target.type === 'review' && dto.target.reviewId && !dto.target.commentId) {
    return { type: 'review', id: dto.target.reviewId };
  }
  if (dto.target.type === 'comment' && dto.target.commentId && !dto.target.reviewId) {
    return { type: 'comment', id: dto.target.commentId };
  }
  throw new BadRequestException({
    code: 'VALIDATION_FAILED',
    message: 'Цель жалобы задана неверно',
  });
}

function toAdminReport(report: ContentReport): AdminReportDto {
  return {
    reportId: report.reportId,
    reporterUserId: report.reporterUserId,
    target:
      report.targetType === 'review'
        ? { type: 'review', reviewId: report.targetId }
        : { type: 'comment', commentId: report.targetId },
    reason: report.reason,
    note: report.note,
    status: report.status,
    decision: report.decision,
    decidedByUserId: report.decidedByUserId,
    decidedAt: report.decidedAt?.toISOString() ?? null,
    createdAt: report.createdAt.toISOString(),
    updatedAt: report.updatedAt.toISOString(),
  };
}

function throwTargetNotFound(type: 'review' | 'comment'): never {
  if (type === 'review') {
    throw new NotFoundException({ code: 'REVIEW_NOT_FOUND', message: 'Рецензия не найдена' });
  }
  throw new NotFoundException({ code: 'COMMENT_NOT_FOUND', message: 'Комментарий не найден' });
}
