export type CompanionPlatform = 'windows' | 'debian' | 'arch';

export const companionInstallFiles = {
  debian: 'yane.deb',
  arch: 'yane.pkg.tar.zst',
} as const;

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

export function companionReleaseHistory(download: string): string | undefined {
  const url = new URL(download);
  if (url.origin !== 'https://github.com') return;
  const match = /^\/([\w.-]+\/[\w.-]+)\/releases\/download\/[\w.-]+\/[^/]+$/.exec(url.pathname);
  if (match) return `${url.origin}/${match[1]}/releases`;
}

export function companionInstallCommand(
  platform: CompanionPlatform | '',
  download?: string,
  shortOrigin?: string,
) {
  if (!download || (platform !== 'debian' && platform !== 'arch')) return;
  const filename = shortOrigin
    ? companionInstallFiles[platform]
    : new URL(download).pathname.split('/').pop();
  if (!filename) return;
  const url = shortOrigin ? `${shortOrigin}/install/${filename}` : download;
  const quote = (value: string) =>
    /^[\w./:%-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`;
  const installer = platform === 'arch' ? 'pacman -U' : 'apt install';
  return `curl -fgLO ${quote(url)} &&\nsudo ${installer} ${quote(`./${filename}`)}`;
}
