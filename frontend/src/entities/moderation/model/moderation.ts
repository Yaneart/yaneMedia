export type ReportReason =
  'spam' | 'abuse' | 'hate' | 'sexual_content' | 'violence' | 'spoiler' | 'other';

export type ReportTarget =
  { type: 'review'; reviewId: string } | { type: 'comment'; commentId: string };

export type ModerationAction = {
  target: ReportTarget;
  action: 'hide' | 'restore';
  decision: string;
};

export type ReportReceipt = {
  reportId: string;
  status: 'received';
  createdAt: string;
};

export type AdminReport = {
  reportId: string;
  reporterUserId: string | null;
  target: ReportTarget;
  reason: ReportReason;
  note: string | null;
  status: 'open' | 'resolved' | 'rejected';
  decision: string | null;
  decidedByUserId: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
