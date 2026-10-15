import { apiRequest } from '@/shared/api';
import type {
  ModerationAction,
  ReportReceipt,
  ReportReason,
  ReportTarget,
} from '../model/moderation';

export function createReport(
  target: ReportTarget,
  reason: ReportReason,
  note?: string,
): Promise<ReportReceipt> {
  return apiRequest<ReportReceipt>('/reports', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-YaneMedia-CSRF': '1' },
    body: JSON.stringify({ target, reason, ...(note ? { note } : {}) }),
  });
}

export function moderateContent({ target, action, decision }: ModerationAction): Promise<void> {
  const resource =
    target.type === 'review'
      ? `reviews/${encodeURIComponent(target.reviewId)}`
      : `comments/${encodeURIComponent(target.commentId)}`;
  return apiRequest<void>(`/admin/${resource}/${action}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-YaneMedia-CSRF': '1' },
    body: JSON.stringify({ decision }),
  });
}
