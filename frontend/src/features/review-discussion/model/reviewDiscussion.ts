import type { ReviewComment, ReviewCommentPage } from '@/entities/review-comment';

export const commentBodyLimit = 2000;

export function normalizeCommentBody(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/gu, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function validateCommentBody(value: string): string | null {
  const body = normalizeCommentBody(value);
  if (!body) return 'Напишите комментарий.';
  if (Array.from(body).length > commentBodyLimit) {
    return `Комментарий не может быть длиннее ${commentBodyLimit} символов.`;
  }
  if (/[<>]/u.test(body)) return 'Используйте обычный текст без угловых скобок.';
  return null;
}

export function mergeReviewComments(pages: readonly ReviewCommentPage[]): ReviewComment[] {
  const comments = new Map<string, ReviewComment>();
  for (const page of pages) {
    for (const comment of page.items) comments.set(comment.commentId, comment);
  }
  return [...comments.values()].sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) ||
      left.commentId.localeCompare(right.commentId),
  );
}

export function appendReviewComment(
  pages: readonly ReviewCommentPage[],
  comment: ReviewComment,
): ReviewCommentPage[] {
  const lastIndex = pages.length - 1;
  return pages.map((page, index) =>
    index === lastIndex ? { ...page, items: [...page.items, comment] } : page,
  );
}

export function replaceReviewComment(
  pages: readonly ReviewCommentPage[],
  updated: ReviewComment,
): ReviewCommentPage[] {
  return pages.map((page) => ({
    ...page,
    items: page.items.map((comment) =>
      comment.commentId === updated.commentId ? updated : comment,
    ),
  }));
}

export function removeReviewComment(
  pages: readonly ReviewCommentPage[],
  commentId: string,
): ReviewCommentPage[] {
  return pages.map((page) => ({
    ...page,
    items: page.items.filter((comment) => comment.commentId !== commentId),
  }));
}

export function wasCommentEdited(comment: ReviewComment): boolean {
  const createdAt = Date.parse(comment.createdAt);
  const updatedAt = Date.parse(comment.updatedAt);
  return Number.isFinite(createdAt) && Number.isFinite(updatedAt) && updatedAt > createdAt;
}
