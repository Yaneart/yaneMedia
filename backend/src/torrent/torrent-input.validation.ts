import type { ValidatedMagnet, ValidatedMetainfo } from './torrent-engine.port';
import { isIP } from 'node:net';

export class TorrentInputError extends Error {}

const invalid = (): never => {
  throw new TorrentInputError('TORRENT_INVALID_INPUT');
};

export function validateMagnet(value: unknown): ValidatedMagnet {
  if (typeof value !== 'string' || Buffer.byteLength(value) > 4096 || !value.startsWith('magnet:?'))
    return invalid();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return invalid();
  }
  if (url.protocol !== 'magnet:' || url.hash || url.username || url.password) return invalid();
  const entries = [...url.searchParams];
  if (entries.length > 32 || entries.length === 0) return invalid();
  const xt = entries.filter(([key]) => key === 'xt');
  if (xt.length !== 1 || !/^urn:btih:(?:[a-fA-F0-9]{40}|[A-Z2-7a-z2-7]{32})$/.test(xt[0][1]))
    return invalid();
  const trackers = entries.filter(([key]) => key === 'tr');
  if (trackers.length > 20) return invalid();
  for (const [key, raw] of entries) {
    if (!['xt', 'tr', 'dn', 'xl'].includes(key) || !raw) return invalid();
    if (key === 'tr') validateTracker(raw);
  }
  // Discard display names and other optional metadata before crossing the engine boundary.
  const params = new URLSearchParams([xt[0], ...trackers]);
  return `magnet:?${params.toString()}` as ValidatedMagnet;
}

type BValue = Buffer | number | BValue[] | Map<string, BValue>;

export function validateMetainfo(input: Uint8Array): ValidatedMetainfo {
  if (input.byteLength === 0 || input.byteLength > 2 * 1024 * 1024) return invalid();
  const bytes = Buffer.from(input);
  let offset = 0;
  let nodes = 0;
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  const decode = (value: Buffer): string => {
    try {
      return utf8.decode(value);
    } catch {
      return invalid();
    }
  };
  const parse = (depth: number): BValue => {
    if (++nodes > 20000 || depth > 32 || offset >= bytes.length) return invalid();
    const start = bytes[offset++];
    if (start === 0x69) {
      const end = bytes.indexOf(0x65, offset);
      if (end < 0) return invalid();
      const value = bytes.toString('ascii', offset, end);
      if (!/^(0|-?[1-9][0-9]*)$/.test(value)) return invalid();
      offset = end + 1;
      const number = Number(value);
      return Number.isSafeInteger(number) ? number : invalid();
    }
    if (start === 0x6c) {
      const list: BValue[] = [];
      while (bytes[offset] !== 0x65) {
        if (offset >= bytes.length || list.length > 500) return invalid();
        list.push(parse(depth + 1));
      }
      offset++;
      return list;
    }
    if (start === 0x64) {
      const dict = new Map<string, BValue>();
      while (bytes[offset] !== 0x65) {
        if (offset >= bytes.length || dict.size > 1000) return invalid();
        const key = parse(depth + 1);
        if (!Buffer.isBuffer(key)) return invalid();
        const name = decode(key);
        if (dict.has(name)) return invalid();
        dict.set(name, parse(depth + 1));
      }
      offset++;
      return dict;
    }
    if (start < 0x30 || start > 0x39) return invalid();
    let end = offset - 1;
    while (bytes[end] !== 0x3a) {
      if (end >= bytes.length || end - offset > 8) return invalid();
      end++;
    }
    const lengthText = bytes.toString('ascii', offset - 1, end);
    if (!/^(0|[1-9][0-9]*)$/.test(lengthText)) return invalid();
    const length = Number(lengthText);
    offset = end + 1;
    if (offset + length > bytes.length) return invalid();
    const result = bytes.subarray(offset, offset + length);
    offset += length;
    return result;
  };
  const root = parse(0);
  if (offset !== bytes.length || !(root instanceof Map)) return invalid();
  if (
    [...root.keys()].some(
      (key) =>
        ![
          'info',
          'announce',
          'announce-list',
          'creation date',
          'comment',
          'created by',
          'encoding',
        ].includes(key),
    )
  )
    return invalid();
  const trackerUrls: string[] = [];
  const announce = root.get('announce');
  if (announce !== undefined) {
    if (!Buffer.isBuffer(announce)) return invalid();
    trackerUrls.push(decode(announce));
  }
  const tiers = root.get('announce-list');
  if (tiers !== undefined) {
    if (!Array.isArray(tiers) || tiers.length > 20) return invalid();
    for (const tier of tiers) {
      if (!Array.isArray(tier) || tier.length === 0 || tier.length > 20) return invalid();
      for (const tracker of tier) {
        if (!Buffer.isBuffer(tracker)) return invalid();
        trackerUrls.push(decode(tracker));
      }
    }
  }
  if (trackerUrls.length > 20) return invalid();
  for (const tracker of trackerUrls) validateTracker(tracker);
  const info = root.get('info');
  if (!(info instanceof Map) || info.has('meta version')) return invalid();
  const name = info.get('name.utf-8') ?? info.get('name');
  if (!Buffer.isBuffer(name)) return invalid();
  validatePart(decode(name));
  const pieceLength = info.get('piece length');
  const pieces = info.get('pieces');
  if (
    typeof pieceLength !== 'number' ||
    pieceLength <= 0 ||
    !Buffer.isBuffer(pieces) ||
    pieces.length % 20 !== 0
  )
    return invalid();
  const files = info.get('files');
  const single = info.get('length');
  if ((files === undefined) === (single === undefined)) return invalid();
  let total = 0;
  const paths = new Set<string>();
  const addLength = (length: BValue | undefined) => {
    if (typeof length !== 'number' || length < 0) return invalid();
    total += length;
    if (!Number.isSafeInteger(total) || total > 200 * 1024 ** 3) return invalid();
  };
  if (files !== undefined) {
    if (!Array.isArray(files) || files.length === 0 || files.length > 500) return invalid();
    for (const file of files) {
      if (!(file instanceof Map) || file.has('attr')) return invalid();
      addLength(file.get('length'));
      const path = file.get('path.utf-8') ?? file.get('path');
      if (!Array.isArray(path) || path.length === 0 || path.length > 16) return invalid();
      const parts = path.map((part) => {
        if (!Buffer.isBuffer(part)) return invalid();
        return validatePart(decode(part));
      });
      const key = parts.join('/').normalize('NFC').toLowerCase();
      if (
        paths.has(key) ||
        [...paths].some(
          (existing) => existing.startsWith(`${key}/`) || key.startsWith(`${existing}/`),
        )
      )
        return invalid();
      paths.add(key);
    }
  } else addLength(single);
  if (total === 0 || pieces.length !== Math.ceil(total / pieceLength) * 20) return invalid();
  return bytes as unknown as ValidatedMetainfo;
}

function validateTracker(raw: string): void {
  if (/\s/.test(raw)) return invalid();
  let tracker: URL;
  try {
    tracker = new URL(raw);
  } catch {
    return invalid();
  }
  if (
    !['udp:', 'http:', 'https:'].includes(tracker.protocol) ||
    !tracker.hostname ||
    isIP(tracker.hostname.replace(/^\[|\]$/g, '')) !== 0 ||
    tracker.hostname === 'localhost' ||
    tracker.hostname.endsWith('.localhost') ||
    tracker.hostname.endsWith('.local') ||
    tracker.username ||
    tracker.password ||
    tracker.hash
  )
    return invalid();
}

function validatePart(value: string): string {
  if (
    !value ||
    [...value].length > 255 ||
    value === '.' ||
    value === '..' ||
    [...value].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return character === '/' || character === '\\' || code < 32 || code === 127;
    })
  )
    return invalid();
  return value;
}
