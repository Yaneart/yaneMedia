import { randomBytes } from 'node:crypto';
import type { EngineFile } from './torrent-engine.port';

export const SUBTITLE_BYTES = 2 * 1024 * 1024;
export const FONT_BYTES = 1024 * 1024;
export const SUBTITLE_LOOKBEHIND = 120;
export type SubtitleFormat = 'vtt' | 'ass' | 'pgs' | 'vobsub';
export interface TorrentSubtitle {
  trackRef: string;
  label: string;
  language: string | null;
  format: SubtitleFormat;
  isDefault: boolean;
  isForced: boolean;
  isSdh: boolean;
  streamIndex?: number;
  sidecar?: { fileIndex: number; size: number; format: 'srt' | 'webvtt' | 'ass' };
}
export interface TorrentFont {
  fontRef: string;
  streamIndex: number;
  size: number;
}

const opaque = (kind: string) => `torrent_${kind}_${randomBytes(16).toString('base64url')}`;
export function uniqueSubtitleLabels(tracks: TorrentSubtitle[]): TorrentSubtitle[] {
  const counts = new Map<string, number>();
  for (const track of tracks) counts.set(track.label, (counts.get(track.label) ?? 0) + 1);
  return tracks.map((track, index) =>
    (counts.get(track.label) ?? 0) > 1
      ? { ...track, label: `${track.label.slice(0, 72)} (${index + 1})` }
      : track,
  );
}
export const subtitleLabel = (value: unknown, fallback: string) =>
  (typeof value === 'string'
    ? value
        .normalize('NFC')
        .replace(/[\p{C}<>]/gu, '')
        .trim()
        .slice(0, 80)
    : '') || fallback;

export function probeSubtitles(streams: Array<Record<string, unknown>>) {
  const subtitles: TorrentSubtitle[] = [];
  const fonts: TorrentFont[] = [];
  const formats: Record<string, SubtitleFormat> = {
    subrip: 'vtt',
    webvtt: 'vtt',
    mov_text: 'vtt',
    text: 'vtt',
    ass: 'ass',
    ssa: 'ass',
    hdmv_pgs_subtitle: 'pgs',
    dvd_subtitle: 'vobsub',
  };
  for (const stream of streams) {
    if (!Number.isSafeInteger(stream.index) || Number(stream.index) < 0) continue;
    const tags = stream.tags as Record<string, unknown> | undefined;
    const disposition = stream.disposition as Record<string, unknown> | undefined;
    const codec = String(stream.codec_name);
    if (stream.codec_type === 'subtitle' && formats[codec] && subtitles.length < 16) {
      subtitles.push({
        trackRef: opaque('subtitle'),
        streamIndex: Number(stream.index),
        label: subtitleLabel(tags?.title, `Subtitles ${subtitles.length + 1}`),
        language:
          typeof tags?.language === 'string' && /^[a-z]{2,3}$/i.test(tags.language)
            ? tags.language.toLowerCase()
            : null,
        format: formats[codec],
        isDefault: disposition?.default === 1,
        isForced: disposition?.forced === 1,
        isSdh: disposition?.hearing_impaired === 1,
      });
    }
    const size = Number(stream.extradata_size);
    if (
      stream.codec_type === 'attachment' &&
      ['ttf', 'otf'].includes(codec) &&
      Number.isSafeInteger(size) &&
      size > 0 &&
      size <= FONT_BYTES &&
      fonts.length < 4
    ) {
      fonts.push({ fontRef: opaque('font'), streamIndex: Number(stream.index), size });
    }
  }
  return { subtitleTracks: uniqueSubtitleLabels(subtitles), subtitleFonts: fonts };
}

// Match private, exact directory + video stem. Never pair subtitles from another episode.
export function sidecarSubtitles(files: EngineFile[], videoIndex: number): TorrentSubtitle[] {
  const video = files.find((file) => file.key === videoIndex);
  if (!video) return [];
  const path = video.path.replace(/\\/g, '/').normalize('NFC');
  const stem = path.replace(/\.[^/.]+$/, '');
  return files
    .flatMap((file): TorrentSubtitle[] => {
      const candidate = file.path.replace(/\\/g, '/').normalize('NFC');
      const match = /\.(srt|vtt|ass|ssa)$/i.exec(candidate);
      if (!match || file.length <= 0 || file.length > SUBTITLE_BYTES) return [];
      const name = candidate.slice(0, -match[0].length);
      if (name !== stem && !name.startsWith(`${stem}.`)) return [];
      const suffix = name
        .slice(stem.length)
        .replace(/^\./, '')
        .toLowerCase()
        .split('.')
        .filter(Boolean);
      if (
        suffix.some(
          (part) => !/^[a-z]{2,3}$/.test(part) && !['forced', 'sdh', 'default'].includes(part),
        )
      )
        return [];
      return [
        {
          trackRef: opaque('subtitle'),
          label: subtitleLabel(candidate.split('/').at(-1), 'Subtitles'),
          language: suffix.find((part) => /^[a-z]{2,3}$/.test(part) && part !== 'sdh') ?? null,
          format: ['ass', 'ssa'].includes(match[1].toLowerCase()) ? 'ass' : 'vtt',
          isDefault: suffix.includes('default'),
          isForced: suffix.includes('forced'),
          isSdh: suffix.includes('sdh'),
          sidecar: {
            fileIndex: file.key,
            size: file.length,
            format:
              match[1].toLowerCase() === 'srt'
                ? 'srt'
                : match[1].toLowerCase() === 'vtt'
                  ? 'webvtt'
                  : 'ass',
          },
        },
      ];
    })
    .slice(0, 16);
}

function seconds(value: string): number {
  const match = /^(?:(\d{1,6}):)?(\d{2}):(\d{2})[.,](\d{2,3})$/.exec(value.trim());
  if (!match || Number(match[2]) > 59 || Number(match[3]) > 59) return NaN;
  return (
    Number(match[1] ?? 0) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3]) +
    Number(`0.${match[4]}`)
  );
}

// FFmpeg output only. Keep authored ASS styles but reject resource sections and malformed events.
export function subtitleWindow(
  content: string,
  format: 'vtt' | 'ass',
  start: number,
  end: number,
): string {
  if (Buffer.byteLength(content) > SUBTITLE_BYTES || content.includes('\0'))
    throw new Error('Invalid subtitles');
  const overlaps = (a: string, b: string) => {
    const from = seconds(a),
      to = seconds(b);
    if (
      !Number.isFinite(from) ||
      !Number.isFinite(to) ||
      to <= from ||
      to - from > SUBTITLE_LOOKBEHIND
    )
      throw new Error('Invalid subtitle cue');
    return to > start && from < end;
  };
  let count = 0;
  if (format === 'vtt') {
    const cues = content
      .replace(/\r/g, '')
      .split(/\n{2,}/)
      .flatMap((block) => {
        if (!block.includes('-->')) return [];
        const lines = block.split('\n');
        const index = lines.findIndex((line) => line.includes('-->'));
        const match = /^(\S+) --> (\S+)(?: .*)?$/.exec(lines[index]);
        if (!match || ++count > 10_000) throw new Error('Invalid subtitle cues');
        return overlaps(match[1], match[2]) ? [block] : [];
      });
    // An empty window is valid; a harmless non-visible cue lets native <track> load.
    return `WEBVTT\n\n${cues.length ? cues.join('\n\n') : '00:00:00.000 --> 00:00:00.001\n\u200b'}\n`;
  }
  let section = '';
  return content
    .replace(/\r/g, '')
    .split('\n')
    .filter((line) => {
      if (/^\[/.test(line)) section = line.trim().toLowerCase();
      if (!['[script info]', '[v4+ styles]', '[v4 styles]', '[events]'].includes(section))
        return false;
      if (!/^Dialogue:/i.test(line)) return true;
      const fields = line.slice(line.indexOf(':') + 1).split(',');
      if (fields.length < 10 || ++count > 10_000) throw new Error('Invalid ASS event');
      return overlaps(fields[1], fields[2]);
    })
    .join('\n');
}

export function validateSubtitleFont(bytes: Buffer): void {
  if (
    bytes.length < 12 ||
    bytes.length > FONT_BYTES ||
    ![0x00010000, 0x4f54544f].includes(bytes.readUInt32BE(0))
  )
    throw new Error('Invalid subtitle font');
  const tables = bytes.readUInt16BE(4);
  if (!tables || tables > 128 || 12 + tables * 16 > bytes.length)
    throw new Error('Invalid font tables');
  for (let i = 0; i < tables; i++) {
    const offset = bytes.readUInt32BE(12 + i * 16 + 8),
      size = bytes.readUInt32BE(12 + i * 16 + 12);
    if (offset < 12 + tables * 16 || offset + size > bytes.length)
      throw new Error('Invalid font table bounds');
  }
}
