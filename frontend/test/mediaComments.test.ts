import { describe, expect, test } from 'bun:test';

import type { MediaComment } from '../src/entities/media-comment';
import {
  appendMediaComment,
  mergeMediaComments,
  normalizeMediaCommentBody,
  removeMediaComment,
  replaceMediaComment,
  validateMediaCommentBody,
} from '../src/features/media-comments/model/mediaComments';

function comment(commentId: string, createdAt: string): MediaComment {
  return {
    commentId,
    parentCommentId: null,
    deleted: false,
    author: { state: 'deleted', label: 'Удалённый пользователь' },
    body: commentId,
    createdAt,
    updatedAt: createdAt,
    viewerActions: {
      canEdit: false,
      canDelete: false,
      canReply: false,
      canReport: false,
      canModerate: false,
    },
  };
}

describe('media comments model', () => {
  test('normalizes and validates like the server', () => {
    expect(normalizeMediaCommentBody('  Первая  \r\n\r\n\r\n Вторая  ')).toBe('Первая\n\nВторая');
    expect(validateMediaCommentBody('   ')).toBe('Напишите комментарий.');
    expect(validateMediaCommentBody('<b>нет</b>')).toContain('угловых скобок');
    expect(validateMediaCommentBody('текст')).toBeNull();
  });

  test('merges pages chronologically and patches cached items', () => {
    const first = comment('media_comment_b', '2026-10-15T10:01:00.000Z');
    const second = comment('media_comment_a', '2026-10-15T10:00:00.000Z');
    const pages = [
      { items: [first], nextCursor: 'next' },
      { items: [second, first], nextCursor: null },
    ];
    expect(mergeMediaComments(pages).map((item) => item.commentId)).toEqual([
      'media_comment_a',
      'media_comment_b',
    ]);

    const appended = appendMediaComment(
      pages,
      comment('media_comment_c', '2026-10-15T10:02:00.000Z'),
    );
    expect(appended[1]?.items).toHaveLength(3);
    expect(
      replaceMediaComment(appended, { ...first, body: 'Новая версия' })[0]?.items[0]?.body,
    ).toBe('Новая версия');
    expect(
      removeMediaComment(appended, first.commentId).flatMap((page) => page.items),
    ).not.toContain(first);
  });
});
