export type ReportReasonDto =
  'spam' | 'abuse' | 'hate' | 'sexual_content' | 'violence' | 'spoiler' | 'other';

export type ReportTargetDto =
  { type: 'review'; reviewId: string } | { type: 'comment'; commentId: string };

export type ModerationActionDto = {
  target: ReportTargetDto;
  action: 'hide' | 'restore';
  decision: string;
};

export type ReportReceiptDto = {
  reportId: string;
  status: 'received';
  createdAt: string;
};

export type AdminReportDto = {
  reportId: string;
  reporterUserId: string | null;
  target: ReportTargetDto;
  reason: ReportReasonDto;
  note: string | null;
  status: 'open' | 'resolved' | 'rejected';
  decision: string | null;
  decidedByUserId: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
