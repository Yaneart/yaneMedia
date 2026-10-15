import { ConfigService } from '@nestjs/config';
import { MediaCommentCursorService } from '../../src/media-comments/media-comment-cursor.service';

describe('MediaCommentCursorService', () => {
  const service = new MediaCommentCursorService(
    new ConfigService({ CURSOR_SECRET: 'm'.repeat(64) }),
  );
  const mediaRef = 'work_00000000-0000-4000-8000-000000000001';
  const boundary = {
    createdAt: new Date('2026-10-15T10:00:00.000Z'),
    commentId: 'media_comment_00000000-0000-4000-8000-000000000001',
  };

  it('round-trips a cursor bound to one media work', () => {
    expect(service.decode(service.encode(mediaRef, boundary), mediaRef)).toEqual(boundary);
  });

  it('rejects tampering and use for another media work', () => {
    const cursor = service.encode(mediaRef, boundary);
    for (const action of [
      () => service.decode(`${cursor}x`, mediaRef),
      () => service.decode(cursor, mediaRef.replace(/1$/, '2')),
    ]) {
      expect(action).toThrow();
      try {
        action();
      } catch (error: unknown) {
        expect(error).toMatchObject({ response: { code: 'CURSOR_INVALID' } });
      }
    }
  });

  it('rejects expired cursors', () => {
    const now = Date.now();
    const cursor = service.encode(mediaRef, boundary);
    const clock = jest.spyOn(Date, 'now').mockReturnValue(now + 60 * 60_000 + 1);
    expect(() => service.decode(cursor, mediaRef)).toThrow();
    clock.mockRestore();
  });
});
