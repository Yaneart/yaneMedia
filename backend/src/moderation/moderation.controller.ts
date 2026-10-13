import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { AuthenticatedUser } from '../auth/auth-request';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { SessionGuard } from '../auth/guards/session.guard';
import { CommentIdDto } from '../comments/dto/review-comment.dto';
import { NoStore } from '../platform/http/cache-policy';
import {
  StrictBodyFields,
  StrictBodyFieldsGuard,
  StrictQueryFields,
  StrictQueryFieldsGuard,
} from '../profile/strict-body-fields.guard';
import { ReviewIdDto } from '../reviews/dto/review.dto';
import {
  AdminReportListQueryDto,
  type AdminReportCursorPageDto,
  CreateReportDto,
  ModerationDecisionDto,
  ReportIdDto,
  type ReportReceiptDto,
} from './dto/moderation.dto';
import { ModerationService } from './moderation.service';
import { StrictReportTargetGuard } from './strict-report-target.guard';

const strictValidation = new ValidationPipe({
  transform: true,
  whitelist: true,
  forbidNonWhitelisted: true,
});

@Controller('reports')
export class ReportsController {
  constructor(private readonly moderationService: ModerationService) {}

  @Post()
  @NoStore()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(
    SessionGuard,
    CsrfGuard,
    ThrottlerGuard,
    StrictBodyFieldsGuard,
    StrictReportTargetGuard,
  )
  @StrictBodyFields('target', 'reason', 'note')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(strictValidation) dto: CreateReportDto,
  ): Promise<ReportReceiptDto> {
    return this.moderationService.createReport(user.id, dto);
  }
}

@Controller('admin')
export class AdminModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Get('reports')
  @NoStore()
  @UseGuards(SessionGuard, AdminGuard, StrictQueryFieldsGuard)
  @StrictQueryFields('status', 'cursor', 'limit')
  listReports(
    @Query(strictValidation) query: AdminReportListQueryDto,
  ): Promise<AdminReportCursorPageDto> {
    return this.moderationService.listReports(query);
  }

  @Post('reviews/:reviewId/hide')
  @HttpCode(204)
  @NoStore()
  @UseGuards(SessionGuard, CsrfGuard, AdminGuard, StrictBodyFieldsGuard)
  @StrictBodyFields('decision')
  hideReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param(strictValidation) { reviewId }: ReviewIdDto,
    @Body(strictValidation) dto: ModerationDecisionDto,
  ): Promise<void> {
    return this.moderationService.setReviewVisibility(user.id, reviewId, false, dto);
  }

  @Post('reviews/:reviewId/restore')
  @HttpCode(204)
  @NoStore()
  @UseGuards(SessionGuard, CsrfGuard, AdminGuard, StrictBodyFieldsGuard)
  @StrictBodyFields('decision')
  restoreReview(
    @CurrentUser() user: AuthenticatedUser,
    @Param(strictValidation) { reviewId }: ReviewIdDto,
    @Body(strictValidation) dto: ModerationDecisionDto,
  ): Promise<void> {
    return this.moderationService.setReviewVisibility(user.id, reviewId, true, dto);
  }

  @Post('comments/:commentId/hide')
  @HttpCode(204)
  @NoStore()
  @UseGuards(SessionGuard, CsrfGuard, AdminGuard, StrictBodyFieldsGuard)
  @StrictBodyFields('decision')
  hideComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param(strictValidation) { commentId }: CommentIdDto,
    @Body(strictValidation) dto: ModerationDecisionDto,
  ): Promise<void> {
    return this.moderationService.setCommentVisibility(user.id, commentId, false, dto);
  }

  @Post('comments/:commentId/restore')
  @HttpCode(204)
  @NoStore()
  @UseGuards(SessionGuard, CsrfGuard, AdminGuard, StrictBodyFieldsGuard)
  @StrictBodyFields('decision')
  restoreComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param(strictValidation) { commentId }: CommentIdDto,
    @Body(strictValidation) dto: ModerationDecisionDto,
  ): Promise<void> {
    return this.moderationService.setCommentVisibility(user.id, commentId, true, dto);
  }

  @Post('reports/:reportId/resolve')
  @HttpCode(204)
  @NoStore()
  @UseGuards(SessionGuard, CsrfGuard, AdminGuard, StrictBodyFieldsGuard)
  @StrictBodyFields('decision')
  resolveReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param(strictValidation) { reportId }: ReportIdDto,
    @Body(strictValidation) dto: ModerationDecisionDto,
  ): Promise<void> {
    return this.moderationService.decideReport(user.id, reportId, 'resolved', dto);
  }

  @Post('reports/:reportId/reject')
  @HttpCode(204)
  @NoStore()
  @UseGuards(SessionGuard, CsrfGuard, AdminGuard, StrictBodyFieldsGuard)
  @StrictBodyFields('decision')
  rejectReport(
    @CurrentUser() user: AuthenticatedUser,
    @Param(strictValidation) { reportId }: ReportIdDto,
    @Body(strictValidation) dto: ModerationDecisionDto,
  ): Promise<void> {
    return this.moderationService.decideReport(user.id, reportId, 'rejected', dto);
  }
}
