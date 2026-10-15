import type { ReportReason } from '@/entities/moderation';

export const reportReasons = [
  { value: 'spam', label: 'Спам' },
  { value: 'abuse', label: 'Оскорбления или травля' },
  { value: 'hate', label: 'Язык ненависти' },
  { value: 'sexual_content', label: 'Сексуальный контент' },
  { value: 'violence', label: 'Жестокий контент' },
  { value: 'spoiler', label: 'Неотмеченный спойлер' },
  { value: 'other', label: 'Другое' },
] as const satisfies ReadonlyArray<{ value: ReportReason; label: string }>;

export function normalizeReportNote(note: string): string {
  return note
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/gu, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function validateReportNote(reason: ReportReason, note: string): string | null {
  const normalized = normalizeReportNote(note);
  if (reason === 'other' && !normalized) {
    return 'Для причины «Другое» добавьте пояснение.';
  }
  if (Array.from(normalized).length > 1000 || /[<>]/u.test(normalized)) {
    return 'Пояснение: до 1000 символов обычного текста без угловых скобок.';
  }
  return null;
}
