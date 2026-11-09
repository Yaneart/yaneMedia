import { expect, test } from 'bun:test';
import {
  companionDownload,
  detectCompanionPlatform,
} from '../src/features/companion/model/installation';

test('platform detection is a suggestion with no mobile or macOS installer', () => {
  expect(detectCompanionPlatform('Mozilla Windows NT 10.0; Win64; x64')).toBe('windows');
  expect(detectCompanionPlatform('Mozilla X11; Ubuntu; Linux x86_64')).toBe('debian');
  expect(detectCompanionPlatform('Mozilla X11; Arch Linux x86_64')).toBe('arch');
  for (const ua of ['Android Linux', 'iPhone', 'Macintosh', 'unknown'])
    expect(detectCompanionPlatform(ua)).toBe('');
});

test('download links require an explicitly configured HTTPS release and known version', () => {
  const base = 'https://downloads.example/companion/0.2.0/';
  expect(companionDownload('windows', base, '0.2.0')).toBe(
    `${base}yanecompanion-0.2.0-windows-amd64-setup.exe`,
  );
  expect(companionDownload('debian', base, '0.2.0')).toEndWith('yanecompanion_0.2.0_amd64.deb');
  expect(companionDownload('arch', base, '0.2.0')).toEndWith(
    'yanecompanion-bin-0.2.0-1-x86_64.pkg.tar.zst',
  );
  for (const unsafe of [
    '',
    'http://example.com',
    'https://user:password@example.com',
    'javascript:alert(1)',
    'https://example.com/?token=x',
    'https://example.com/#x',
  ])
    expect(companionDownload('windows', unsafe, '0.2.0')).toBeUndefined();
  expect(companionDownload('', base, '0.2.0')).toBeUndefined();
  expect(companionDownload('windows', base, '../bad')).toBeUndefined();
});
