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
  const files = status.files.flatMap((file) => {
    total += file.length;
    if (!Number.isSafeInteger(total) || total > MAX_TORRENT_BYTES || file.length > MAX_FILE_BYTES)
      throw new TorrentMetadataError('TORRENT_SIZE_LIMIT_EXCEEDED');
    if (file.length === 0 || isPadding(file)) return [];
    const name = file.path.split(/[\\/]/).at(-1) ?? '';
    const extension = name.toLowerCase().split('.').at(-1) ?? '';
    if (!VIDEO_EXTENSIONS.has(extension)) return [];
    const displayName = sanitizeName(name);
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
