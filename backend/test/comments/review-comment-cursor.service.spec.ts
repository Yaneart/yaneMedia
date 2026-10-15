import { ConfigService } from '@nestjs/config';
import { ReviewCommentCursorService } from '../../src/comments/review-comment-cursor.service';

describe('ReviewCommentCursorService', () => {
  const service = new ReviewCommentCursorService(
    new ConfigService({ CURSOR_SECRET: 'c'.repeat(64) }),
  );
  const reviewId = 'review_00000000-0000-4000-8000-000000000001';
  const boundary = {
    createdAt: new Date('2026-10-13T10:00:00.000Z'),
    commentId: 'comment_00000000-0000-4000-8000-000000000001',
  };

  it('round-trips route-bound page and newer cursors', () => {
    const page = service.encodePage(reviewId, boundary, boundary);
    expect(service.decodePage(page, reviewId)).toEqual({ after: boundary, ceiling: boundary });

    const newer = service.encodeNewer(reviewId, boundary);
    expect(service.decodeNewer(newer, reviewId)).toEqual(boundary);
    expect(service.decodeNewer(service.encodeNewer(reviewId, null), reviewId)).toBeNull();
  });

  it('rejects tampering, another review, and swapping cursor kinds', () => {
    const page = service.encodePage(reviewId, boundary, boundary);
    const newer = service.encodeNewer(reviewId, boundary);
    const anotherReview = 'review_00000000-0000-4000-8000-000000000002';

    for (const action of [
      () => service.decodePage(`${page}x`, reviewId),
      () => service.decodePage(page, anotherReview),
      () => service.decodePage(newer, reviewId),
      () => service.decodeNewer(page, reviewId),
    ]) {
      let caught: unknown;
      try {
        action();
      } catch (error: unknown) {
        caught = error;
      }
      expect(caught).toMatchObject({ response: { code: 'CURSOR_INVALID' } });
    }
  });

  it('rejects expired cursors', () => {
    const now = Date.now();
    const cursor = service.encodeNewer(reviewId, boundary);
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now + 60 * 60_000 + 1);

    expect(() => service.decodeNewer(cursor, reviewId)).toThrow();
    clock.mockRestore();
  });
});
