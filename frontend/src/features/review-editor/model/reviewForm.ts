import type { ReviewDraft } from '@/entities/review';

export const REVIEW_TITLE_MAX_LENGTH = 120;
export const REVIEW_BODY_MIN_LENGTH = 20;
export const REVIEW_BODY_MAX_LENGTH = 10_000;

export type ReviewFormErrors = Partial<Record<'title' | 'body', string>>;

export function countCharacters(value: string): number {
  return Array.from(value).length;
}

export function normalizeReviewDraft(draft: ReviewDraft): ReviewDraft {
  return {
    title: draft.title.replace(/\s+/gu, ' ').trim(),
    body: draft.body.replace(/\r\n?/g, '\n').trim(),
    isSpoiler: draft.isSpoiler,
  };
}

export function validateReviewDraft(draft: ReviewDraft): ReviewFormErrors {
  const normalized = normalizeReviewDraft(draft);
  const errors: ReviewFormErrors = {};
  const titleLength = countCharacters(normalized.title);
  const bodyLength = countCharacters(normalized.body);

  if (titleLength === 0) errors.title = 'Добавьте заголовок рецензии.';
  else if (titleLength > REVIEW_TITLE_MAX_LENGTH)
    errors.title = `Заголовок должен быть не длиннее ${REVIEW_TITLE_MAX_LENGTH} символов.`;
  else if (/[<>]/u.test(normalized.title))
    errors.title = 'Заголовок должен быть обычным текстом без угловых скобок.';

  if (bodyLength < REVIEW_BODY_MIN_LENGTH)
    errors.body = `Напишите не менее ${REVIEW_BODY_MIN_LENGTH} символов.`;
  else if (bodyLength > REVIEW_BODY_MAX_LENGTH)
    errors.body = `Текст должен быть не длиннее ${REVIEW_BODY_MAX_LENGTH} символов.`;
  else if (/[<>]/u.test(normalized.body))
    errors.body = 'Рецензия должна быть обычным текстом без угловых скобок.';

  return errors;
}

export function reviewDraftsEqual(left: ReviewDraft, right: ReviewDraft): boolean {
  return (
    left.title === right.title && left.body === right.body && left.isSpoiler === right.isSpoiler
  );
}
