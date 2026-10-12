import { BadRequestException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { ProfileCollectionCursorService } from '../../src/profile/profile-collection-cursor.service';

describe('ProfileCollectionCursorService', () => {
  const boundary = {
    addedAt: new Date('2026-10-12T10:00:00.000Z'),
    mediaRef: 'work_00000000-0000-4000-8000-000000000001',
  };
  const service = new ProfileCollectionCursorService({
    get: jest.fn().mockReturnValue('a'.repeat(32)),
  } as unknown as ConfigService);

  afterEach(() => jest.useRealTimers());

  it('round-trips a signed boundary only for the bound collection and owner', () => {
    const cursor = service.encode('favorites', 'yaneart', boundary);

    expect(service.decode(cursor, 'favorites', 'yaneart')).toEqual(boundary);
    expect(() => service.decode(cursor, 'ratings', 'yaneart')).toThrow(BadRequestException);
    expect(() => service.decode(cursor, 'favorites', 'another_user')).toThrow(BadRequestException);
  });

  it('rejects a modified or expired cursor with CURSOR_INVALID', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-12T10:00:00.000Z'));
    const cursor = service.encode('favorites', 'yaneart', boundary);
    const modified = `${cursor.slice(0, -1)}${cursor.endsWith('a') ? 'b' : 'a'}`;

    expect(() => service.decode(modified, 'favorites', 'yaneart')).toThrow(BadRequestException);
    jest.setSystemTime(new Date('2026-10-12T11:00:00.001Z'));
    try {
      service.decode(cursor, 'favorites', 'yaneart');
      throw new Error('Expected the cursor to expire');
    } catch (error) {
      expect(error).toMatchObject({ response: { code: 'CURSOR_INVALID' } });
    }
  });
});
