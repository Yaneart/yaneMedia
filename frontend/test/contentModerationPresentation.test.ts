import { describe, expect, test } from 'bun:test';

import {
  normalizeModerationDecision,
  validateModerationDecision,
} from '../src/features/content-moderation/model/contentModeration';
import {
  normalizeReportNote,
  validateReportNote,
} from '../src/features/content-report/model/contentReport';

describe('report and moderation presentation', () => {
  test('normalizes report notes and requires context for the other reason', () => {
    expect(normalizeReportNote('  два  \r\n  абзаца  ')).toBe('два\nабзаца');
    expect(validateReportNote('other', '   ')).toContain('пояснение');
    expect(validateReportNote('spam', '')).toBeNull();
    expect(validateReportNote('abuse', '<script>')).toContain('угловых скобок');
  });

  test('requires a bounded plain-text moderation decision', () => {
    expect(normalizeModerationDecision('  Скрыть   спам  ')).toBe('Скрыть спам');
    expect(validateModerationDecision('')).toContain('основание');
    expect(validateModerationDecision('Проверено')).toBeNull();
    expect(validateModerationDecision('x'.repeat(1001))).toContain('1000');
  });
});
