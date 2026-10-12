import { ConfigService } from '@nestjs/config';
import { ProfileReviewCursorService } from '../../src/reviews/profile-review-cursor.service';

describe('ProfileReviewCursorService', () => {
  const ownerId = '93ea2794-e805-4f60-b14f-2005d2c61804';
  const boundary = {
    createdAt: new Date('2026-10-12T10:00:00.000Z'),
    reviewId: 'review_00000000-0000-4000-8000-000000000001',
  };
  const service = new ProfileReviewCursorService(
    new ConfigService({ CURSOR_SECRET: 'profile-review-cursor-secret' }),
  );

  it('round-trips a cursor without exposing the internal owner id', () => {
    const cursor = service.encode(ownerId, boundary);
    expect(service.decode(cursor, ownerId)).toEqual(boundary);
    expect(Buffer.from(cursor.split('.')[0], 'base64url').toString('utf8')).not.toContain(ownerId);
  });

  it('rejects another owner and a tampered cursor', () => {
    const cursor = service.encode(ownerId, boundary);
    expect(() => service.decode(cursor, '93ea2794-e805-4f60-b14f-2005d2c61805')).toThrow(
      'Курсор недействителен или истёк',
    );
    expect(() => service.decode(`${cursor}x`, ownerId)).toThrow('Курсор недействителен или истёк');
  });
});
