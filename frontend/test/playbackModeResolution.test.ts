import { describe, expect, test } from 'bun:test';

import { resolveAvailablePlaybackMode } from '../src/pages/media/model/playbackModeResolution';

describe('playback mode availability resolution', () => {
  test('keeps a restored direct session selected while episode sources refresh', () => {
    expect(resolveAvailablePlaybackMode('direct', true, false, true)).toBe('direct');
  });

  test('falls back to embed after an episode refresh confirms no direct sources', () => {
    expect(resolveAvailablePlaybackMode('direct', true, false, false)).toBe('embed');
  });

  test('reveals direct mode when selected episode sources arrive', () => {
    expect(resolveAvailablePlaybackMode('embed', true, true, false)).toBe('embed');
    expect(resolveAvailablePlaybackMode('embed', false, true, false)).toBe('direct');
  });
});
