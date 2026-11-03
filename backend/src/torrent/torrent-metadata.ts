import { randomBytes } from 'node:crypto';
import type { EngineFile, EngineTorrentStatus } from './torrent-engine.port';

export type TorrentMetadataFailure =
  'TORRENT_METADATA_TIMEOUT' | 'TORRENT_NO_VIDEO_FILES' | 'TORRENT_SIZE_LIMIT_EXCEEDED';

export const MAX_TORRENT_BYTES = 200 * 1024 ** 3;
export const MAX_FILE_BYTES = MAX_TORRENT_BYTES;
const VIDEO_EXTENSIONS = new Set([
  'avi',
  'flv',
  'm2ts',
  'm4v',
  'mkv',
  'mov',
  'mp4',
  'mpeg',
  'mpg',
  'ts',
  'webm',
  'wmv',
]);

export class TorrentMetadataError extends Error {
  constructor(readonly code: TorrentMetadataFailure) {
    super(code);
  }
}

export function mapTorrentFiles(status: EngineTorrentStatus) {
  if (status.totalBytes > MAX_TORRENT_BYTES)
    throw new TorrentMetadataError('TORRENT_SIZE_LIMIT_EXCEEDED');
  let total = 0;
  const paths = status.files.map((file) => file.path.replace(/\\/g, '/'));
  const root = paths[0]?.split('/')[0];
  const sharedRoot =
    root &&
    !/(?:^|[ ._-])(?:season|сезон|s)[ ._-]*\d|\d{1,2}[ ._-]*сезон|extras?|specials?|доп/i.test(
      root,
    ) &&
    paths.every((path) => path.startsWith(`${root}/`))
      ? root
      : null;
  const files = status.files.flatMap((file) => {
    total += file.length;
    if (!Number.isSafeInteger(total) || total > MAX_TORRENT_BYTES || file.length > MAX_FILE_BYTES)
      throw new TorrentMetadataError('TORRENT_SIZE_LIMIT_EXCEEDED');
    if (file.length === 0 || isPadding(file)) return [];
    const name = file.path.split(/[\\/]/).at(-1) ?? '';
    const extension = name.toLowerCase().split('.').at(-1) ?? '';
    if (!VIDEO_EXTENSIONS.has(extension)) return [];
    const relative = file.path.replace(/\\/g, '/');
    const parts = relative.split('/');
    const safeRelative =
      !/^(?:\/|[a-z]:)/i.test(relative) && !parts.some((part) => part === '..' || part === '.');
    const displayName = safeRelative
      ? Array.from(
          (sharedRoot ? parts.slice(1) : parts).map(sanitizeName).filter(Boolean).join('/'),
        )
          .slice(-255)
          .join('')
      : sanitizeName(name);
    if (!displayName) return [];
    return [
      {
        fileRef: `torrent_file_${randomBytes(16).toString('base64url')}`,
        engineFileIndex: file.key,
        displayName,
        sizeBytes: file.length,
      },
    ];
  });
  if (files.length === 0) throw new TorrentMetadataError('TORRENT_NO_VIDEO_FILES');
  return files;
}

function isPadding(file: EngineFile): boolean {
  return file.path
    .split(/[\\/]/)
    .some((part) => /^\.pad$|^_____padding_file_|^\.padding$/i.test(part));
}

function sanitizeName(name: string): string {
  const clean = name
    .normalize('NFC')
    .replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/gu, '')
    .trim();
  if (clean === '.' || clean === '..') return '';
  return [...clean].slice(0, 255).join('');
}
