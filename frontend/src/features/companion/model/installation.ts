export type CompanionPlatform = 'windows' | 'debian' | 'arch';

export function detectCompanionPlatform(userAgent: string): CompanionPlatform | '' {
  if (/Android|iPhone|iPad|iPod|Macintosh/i.test(userAgent)) return '';
  if (/Windows/i.test(userAgent)) return 'windows';
  if (/Linux|X11/i.test(userAgent)) return /Arch/i.test(userAgent) ? 'arch' : 'debian';
  return '';
}

export function companionDownload(
  platform: CompanionPlatform | '',
  base = import.meta.env.VITE_COMPANION_DOWNLOAD_BASE_URL,
  version = import.meta.env.VITE_COMPANION_DOWNLOAD_VERSION,
): string | undefined {
  if (!platform || !base || !version || !/^\d+\.\d+\.\d+$/.test(version)) return;
  try {
    const url = new URL(base);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return;
    const filenames = {
      windows: `yanecompanion-${version}-windows-amd64-setup.exe`,
      debian: `yanecompanion_${version}_amd64.deb`,
      arch: `yanecompanion-bin-${version}-1-x86_64.pkg.tar.zst`,
    };
    return `${url.href.replace(/\/$/, '')}/${filenames[platform]}`;
  } catch {
    return;
  }
}
