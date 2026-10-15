import type { MediaComment, MediaCommentPage } from '@/entities/media-comment';

export const mediaCommentBodyLimit = 2000;

export function normalizeMediaCommentBody(value: string): string {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[^\S\n]+/gu, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function validateMediaCommentBody(value: string): string | null {
  const body = normalizeMediaCommentBody(value);
  if (!body) return 'Напишите комментарий.';
  if (Array.from(body).length > mediaCommentBodyLimit) {
    return `Комментарий не может быть длиннее ${mediaCommentBodyLimit} символов.`;
  }
  if (/[<>]/u.test(body)) return 'Используйте обычный текст без угловых скобок.';
  return null;
}

export function mergeMediaComments(pages: readonly MediaCommentPage[]): MediaComment[] {
  const comments = new Map<string, MediaComment>();
  for (const page of pages) {
    for (const comment of page.items) comments.set(comment.commentId, comment);
  }
  return [...comments.values()].sort(
    (left, right) =>
      left.createdAt.localeCompare(right.createdAt) ||
      left.commentId.localeCompare(right.commentId),
  );
}

export function appendMediaComment(
  pages: readonly MediaCommentPage[],
  comment: MediaComment,
): MediaCommentPage[] {
  const lastIndex = pages.length - 1;
  return pages.map((page, index) =>
    index === lastIndex ? { ...page, items: [...page.items, comment] } : page,
  );
}

export function replaceMediaComment(
  pages: readonly MediaCommentPage[],
  updated: MediaComment,
): MediaCommentPage[] {
  return pages.map((page) => ({
    ...page,
    items: page.items.map((comment) =>
      comment.commentId === updated.commentId ? updated : comment,
    ),
  }));
}

export function removeMediaComment(
  pages: readonly MediaCommentPage[],
  commentId: string,
): MediaCommentPage[] {
  return pages.map((page) => ({
    ...page,
    items: page.items.filter((comment) => comment.commentId !== commentId),
  }));
}

export function wasMediaCommentEdited(comment: MediaComment): boolean {
  const createdAt = Date.parse(comment.createdAt);
  const updatedAt = Date.parse(comment.updatedAt);
  return Number.isFinite(createdAt) && Number.isFinite(updatedAt) && updatedAt > createdAt;
}
