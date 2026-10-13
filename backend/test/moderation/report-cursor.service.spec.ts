import { ConfigService } from '@nestjs/config';
import { ReportCursorService } from '../../src/moderation/report-cursor.service';

describe('ReportCursorService', () => {
  const service = new ReportCursorService(new ConfigService({ CURSOR_SECRET: 'm'.repeat(32) }));
  const boundary = {
    createdAt: new Date('2026-10-13T10:00:00.000Z'),
    reportId: 'report_00000000-0000-4000-8000-000000000001',
  };

  it('round-trips a status-bound boundary', () => {
    expect(service.decode(service.encode('open', boundary), 'open')).toEqual(boundary);
  });

  it('rejects tampering and reuse with another filter', () => {
    const cursor = service.encode('open', boundary);
    expect(() => service.decode(`${cursor}x`, 'open')).toThrow();
    expect(() => service.decode(cursor, 'all')).toThrow();
  });
});
