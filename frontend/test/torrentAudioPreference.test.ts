import { expect, test } from 'bun:test';
import {
  preferredTorrentAudio,
  rememberTorrentAudio,
  resetTorrentClientScope,
} from '../src/entities/torrent-session';

test('matches descriptive identity across refs, falls back to language/default, and isolates accounts', () => {
  resetTorrentClientScope();
  const tracks = [
    { ref: 'default', label: 'Original', language: 'eng', channels: 2, isDefault: true },
    { ref: 'old', label: 'Dub', language: 'rus', channels: 2, isDefault: false },
  ];
  rememberTorrentAudio(tracks[1]);
  const next = tracks.map((track) => ({ ...track, ref: 'new-' + track.ref }));
  expect(preferredTorrentAudio(next)?.ref).toBe('new-old');
  expect(preferredTorrentAudio([{ ...next[1], label: 'Other dub' }, next[0]])?.ref).toBe('new-old');
  expect(preferredTorrentAudio([next[0]])?.ref).toBe('new-default');
  resetTorrentClientScope();
  expect(preferredTorrentAudio(next)?.ref).toBe('new-default');
  expect(preferredTorrentAudio([])).toBeUndefined();
});
