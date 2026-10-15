import { DrizzleQueryError } from 'drizzle-orm';
import { DatabaseError } from 'pg';
import type { ContentReport } from '../../src/moderation/entities/moderation.entity';
import type { ModerationRepository } from '../../src/moderation/moderation.repository';
import { ModerationService } from '../../src/moderation/moderation.service';
import type { ReportCursorService } from '../../src/moderation/report-cursor.service';

describe('ModerationService', () => {
  const userId = '93ea2794-e805-4f60-b14f-2005d2c61804';
  const reviewId = 'review_00000000-0000-4000-8000-000000000001';
  const report: ContentReport = {
    reportId: 'report_00000000-0000-4000-8000-000000000001',
    reporterUserId: userId,
    targetType: 'review',
    targetId: reviewId,
    reason: 'spam',
    note: null,
    status: 'open',
    decision: null,
    decidedByUserId: null,
    decidedAt: null,
    createdAt: new Date('2026-10-13T10:00:00.000Z'),
    updatedAt: new Date('2026-10-13T10:00:00.000Z'),
  };
  const findReporter = jest.fn();
  const createReport = jest.fn();
  const findReports = jest.fn();
  const setReviewVisibility = jest.fn();
  const setCommentVisibility = jest.fn();
  const decideReport = jest.fn();
  const encode = jest.fn();
  const decode = jest.fn();
  const service = new ModerationService(
    {
      findReporter,
      createReport,
      findReports,
      setReviewVisibility,
      setCommentVisibility,
      decideReport,
    } as unknown as ModerationRepository,
    { encode, decode } as unknown as ReportCursorService,
  );

  beforeEach(() => {
    findReporter.mockReset().mockResolvedValue({ id: userId, emailVerifiedAt: new Date() });
    createReport.mockReset().mockResolvedValue({ state: 'created', report });
    findReports.mockReset().mockResolvedValue([]);
    setReviewVisibility.mockReset().mockResolvedValue(true);
    setCommentVisibility.mockReset().mockResolvedValue(true);
    decideReport.mockReset().mockResolvedValue(true);
    encode.mockReset().mockReturnValue('next');
    decode.mockReset();
  });

  it('creates an opaque receipt without exposing report internals', async () => {
    await expect(
      service.createReport(userId, {
        target: { type: 'review', reviewId },
        reason: 'spam',
      }),
    ).resolves.toEqual({
      reportId: report.reportId,
      status: 'received',
      createdAt: '2026-10-13T10:00:00.000Z',
    });
    expect(createReport).toHaveBeenCalledWith({
      reporterUserId: userId,
      targetType: 'review',
      targetId: reviewId,
      reason: 'spam',
      note: undefined,
    });
  });

  it('requires verification, a valid discriminated target, and an other note', async () => {
    findReporter.mockResolvedValueOnce({ id: userId, emailVerifiedAt: null });
    await expect(
      service.createReport(userId, { target: { type: 'review', reviewId }, reason: 'spam' }),
    ).rejects.toMatchObject({ response: { code: 'EMAIL_VERIFICATION_REQUIRED' } });

    await expect(
      service.createReport(userId, {
        target: {
          type: 'review',
          reviewId,
          commentId: 'comment_00000000-0000-4000-8000-000000000001',
        },
        reason: 'spam',
      }),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });
    await expect(
      service.createReport(userId, { target: { type: 'review', reviewId }, reason: 'other' }),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED' } });
  });

  it('hides target existence, rejects self-reports, and maps concurrent duplicates', async () => {
    createReport.mockResolvedValueOnce({ state: 'missing' });
    await expect(
      service.createReport(userId, { target: { type: 'review', reviewId }, reason: 'spam' }),
    ).rejects.toMatchObject({ response: { code: 'REVIEW_NOT_FOUND' } });

    createReport.mockResolvedValueOnce({ state: 'own' });
    await expect(
      service.createReport(userId, { target: { type: 'review', reviewId }, reason: 'spam' }),
    ).rejects.toMatchObject({ response: { code: 'ACTION_FORBIDDEN' } });

    const cause = Object.assign(new DatabaseError('duplicate', 0, 'error'), {
      code: '23505',
      constraint: 'content_reports_reporter_target_open_unique',
    });
    createReport.mockRejectedValueOnce(new DrizzleQueryError('insert', [], cause));
    await expect(
      service.createReport(userId, { target: { type: 'review', reviewId }, reason: 'spam' }),
    ).rejects.toMatchObject({ response: { code: 'REPORT_ALREADY_EXISTS' } });
  });

  it('pages internal reports and keeps reporter/decision data inside the admin DTO', async () => {
    findReports.mockResolvedValue([
      report,
      { ...report, reportId: 'report_00000000-0000-4000-8000-000000000002' },
    ]);
    await expect(service.listReports({ status: 'open', limit: 1 })).resolves.toEqual({
      items: [
        expect.objectContaining({
          reportId: report.reportId,
          reporterUserId: userId,
          target: { type: 'review', reviewId },
          status: 'open',
        }),
      ],
      nextCursor: 'next',
    });
    expect(encode).toHaveBeenCalledWith('open', {
      createdAt: report.createdAt,
      reportId: report.reportId,
    });
  });

  it('delegates audited moderation transitions and hides absent resources', async () => {
    await service.setReviewVisibility(userId, reviewId, false, { decision: 'Нарушение правил' });
    expect(setReviewVisibility).toHaveBeenCalledWith(
      reviewId,
      userId,
      'moderation_hidden',
      'Нарушение правил',
    );
    await service.decideReport(userId, report.reportId, 'resolved', { decision: 'Проверено' });
    expect(decideReport).toHaveBeenCalledWith(report.reportId, userId, 'resolved', 'Проверено');

    setCommentVisibility.mockResolvedValueOnce(false);
    await expect(
      service.setCommentVisibility(userId, 'comment_00000000-0000-4000-8000-000000000001', false, {
        decision: 'Нарушение',
      }),
    ).rejects.toMatchObject({ response: { code: 'COMMENT_NOT_FOUND' } });
  });
});
