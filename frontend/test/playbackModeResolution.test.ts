import { describe, expect, test } from 'bun:test';

import {
  resolveAvailablePlaybackMode,
  shouldShowLocalEpisodeControls,
} from '../src/pages/media/model/playbackModeResolution';

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

  test('shows local season and episode controls only for episodic direct playback', () => {
    expect(shouldShowLocalEpisodeControls('embed', true, true)).toBe(false);
    expect(shouldShowLocalEpisodeControls('direct', false, true)).toBe(false);
    expect(shouldShowLocalEpisodeControls('direct', true, true)).toBe(true);
  });

  test('keeps legacy episode controls until a player-managed embed is available', () => {
    expect(shouldShowLocalEpisodeControls('embed', true, false)).toBe(true);
  });
});
