import { describe, expect, test } from 'bun:test';

import {
  countCharacters,
  normalizeReviewDraft,
  validateReviewDraft,
} from '../src/features/review-editor/model/reviewForm';

describe('review editor form', () => {
  test('normalizes the payload exactly like the server', () => {
    expect(
      normalizeReviewDraft({
        title: '  Сильное\tпродолжение  ',
        body: '  Первая строка.\r\nВторая строка с выводом.  ',
        isSpoiler: true,
      }),
    ).toEqual({
      title: 'Сильное продолжение',
      body: 'Первая строка.\nВторая строка с выводом.',
      isSpoiler: true,
    });
  });

  test('counts user-visible Unicode characters', () => {
    expect(countCharacters('я🙂')).toBe(2);
  });

  test('reports exact title, body, and plain-text limits', () => {
    expect(validateReviewDraft({ title: '', body: 'коротко', isSpoiler: false })).toEqual({
      title: 'Добавьте заголовок рецензии.',
      body: 'Напишите не менее 20 символов.',
    });
    expect(
      validateReviewDraft({
        title: '<b>Заголовок</b>',
        body: 'Достаточно длинный <b>текст</b> рецензии.',
        isSpoiler: false,
      }),
    ).toEqual({
      title: 'Заголовок должен быть обычным текстом без угловых скобок.',
      body: 'Рецензия должна быть обычным текстом без угловых скобок.',
    });
  });
});
