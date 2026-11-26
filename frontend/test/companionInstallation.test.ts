import { expect, test } from 'bun:test';
import {
  companionDownload,
  companionInstallCommand,
  companionReleaseHistory,
  detectCompanionPlatform,
} from '../src/features/companion/model/installation';

test('platform detection is a suggestion with no mobile or macOS installer', () => {
  expect(detectCompanionPlatform('Mozilla Windows NT 10.0; Win64; x64')).toBe('windows');
  expect(detectCompanionPlatform('Mozilla X11; Ubuntu; Linux x86_64')).toBe('debian');
  expect(detectCompanionPlatform('Mozilla X11; Arch Linux x86_64')).toBe('arch');
  for (const ua of ['Android Linux', 'iPhone', 'Macintosh', 'unknown'])
    expect(detectCompanionPlatform(ua)).toBe('');
});

test('terminal commands download the selected Linux asset before installing it', () => {
  const base = 'https://downloads.example/companion/0.3.1';
  const deb = 'yanecompanion_0.3.1_amd64.deb';
  const arch = 'yanecompanion-bin-0.3.1-1-x86_64.pkg.tar.zst';

  expect(companionInstallCommand('debian', companionDownload('debian', base, '0.3.1'))).toBe(
    `curl -fgLO ${base}/${deb} &&\nsudo apt install ./${deb}`,
  );
  expect(companionInstallCommand('arch', companionDownload('arch', base, '0.3.1'))).toBe(
    `curl -fgLO ${base}/${arch} &&\nsudo pacman -U ./${arch}`,
  );
  expect(
    companionInstallCommand('windows', companionDownload('windows', base, '0.3.1')),
  ).toBeUndefined();
  expect(companionInstallCommand('arch')).toBeUndefined();
});

test('public installation uses shorter URLs on the site origin', () => {
  const release = 'https://downloads.example/companion/0.3.1';
  const origin = 'https://watch.example';
  expect(
    companionInstallCommand('debian', companionDownload('debian', release, '0.3.1'), origin),
  ).toBe(`curl -fgLO ${origin}/install/yane.deb &&\nsudo apt install ./yane.deb`);
  expect(companionInstallCommand('arch', companionDownload('arch', release, '0.3.1'), origin)).toBe(
    `curl -fgLO ${origin}/install/yane.pkg.tar.zst &&\nsudo pacman -U ./yane.pkg.tar.zst`,
  );
});

test('release history is available from versioned GitHub downloads', () => {
  const base = 'https://github.com/Yaneart/yaneCompanion/releases/download/v0.3.0';
  for (const platform of ['windows', 'debian', 'arch'] as const) {
    expect(companionReleaseHistory(companionDownload(platform, base, '0.3.0')!)).toBe(
      'https://github.com/Yaneart/yaneCompanion/releases',
    );
  }
  expect(
    companionReleaseHistory(
      'https://github.com.example/Yaneart/yaneCompanion/releases/download/v0.3.0/file',
    ),
  ).toBeUndefined();
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
