import { ConfigService } from '@nestjs/config';
import { ReviewListCursorService } from '../../src/reviews/review-list-cursor.service';

describe('ReviewListCursorService', () => {
  const mediaRef = 'work_00000000-0000-4000-8000-000000000001';
  const snapshotId = '10000000-0000-4000-8000-000000000001';
  const service = new ReviewListCursorService(
    new ConfigService({ CURSOR_SECRET: 'review-cursor-secret-that-is-long-enough' }),
  );

  it('round-trips a cursor bound to the work and sort', () => {
    const cursor = service.encode(
      mediaRef,
      'rating-high',
      { snapshotId, position: 17 },
      new Date(Date.now() + 60_000),
    );
    expect(service.decode(cursor, mediaRef, 'rating-high')).toEqual({ snapshotId, position: 17 });
    expect(() => service.decode(cursor, mediaRef, 'new')).toThrow(
      'Курсор недействителен или истёк',
    );
  });

  it('rejects tampered and expired cursors', () => {
    const valid = service.encode(
      mediaRef,
      'new',
      { snapshotId, position: 1 },
      new Date(Date.now() + 60_000),
    );
    expect(() => service.decode(`${valid}x`, mediaRef, 'new')).toThrow(
      'Курсор недействителен или истёк',
    );

    const expired = service.encode(
      mediaRef,
      'new',
      { snapshotId, position: 1 },
      new Date(Date.now() - 1),
    );
    expect(() => service.decode(expired, mediaRef, 'new')).toThrow(
      'Курсор недействителен или истёк',
    );
  });
});
