import { apiRequest } from '@/shared/api';
import type { ReportReceipt, ReportReason, ReportTarget } from '../model/moderation';

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
