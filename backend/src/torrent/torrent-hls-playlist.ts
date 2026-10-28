import { TORRENT_WINDOW_SEGMENTS } from './torrent-playback-window';

export class InvalidTorrentPlaylist extends Error {}

export type ParsedTorrentPlaylist = {
  targetDuration: number;
  mediaSequence: number;
  segments: { filename: string; duration: string }[];
  ended: boolean;
};

// Parse the small subset emitted by our FFmpeg command. Never forward worker text verbatim.
export function parseTorrentPlaylist(input: string): ParsedTorrentPlaylist {
  if (input.length > 16_384) throw new InvalidTorrentPlaylist();
  const lines = input.trim().split(/\r?\n/);
  if (lines.shift() !== '#EXTM3U') throw new InvalidTorrentPlaylist();
  let version = false;
  let targetDuration: number | undefined;
  let mediaSequence: number | undefined;
  let map = false;
  let independent = false;
  let ended = false;
  let duration: string | undefined;
  const segments: ParsedTorrentPlaylist['segments'] = [];
  for (const line of lines) {
    if (ended || !line || line.trim() !== line) throw new InvalidTorrentPlaylist();
    if (line === '#EXT-X-VERSION:7' && !version) version = true;
    else if (line === '#EXT-X-INDEPENDENT-SEGMENTS' && !independent) independent = true;
    else if (line === '#EXT-X-MAP:URI="init.mp4"' && !map) map = true;
    else if (/^#EXT-X-TARGETDURATION:[1-9]\d?$/.test(line) && targetDuration === undefined)
      targetDuration = Number(line.slice(22));
    else if (/^#EXT-X-MEDIA-SEQUENCE:(0|[1-9]\d{0,9})$/.test(line) && mediaSequence === undefined)
      mediaSequence = Number(line.slice(22));
    else if (/^#EXTINF:(?:[1-9]\d?|0)\.\d{1,6},$/.test(line) && duration === undefined)
      duration = line;
    else if (
      /^segment-\d{6}\.m4s$/.test(line) &&
      duration &&
      segments.length < TORRENT_WINDOW_SEGMENTS
    ) {
      segments.push({ filename: line, duration });
      duration = undefined;
    } else if (line === '#EXT-X-ENDLIST' && duration === undefined) ended = true;
    else throw new InvalidTorrentPlaylist();
  }
  if (
    !version ||
    !independent ||
    !map ||
    targetDuration === undefined ||
    mediaSequence === undefined ||
    duration ||
    !segments.length
  )
    throw new InvalidTorrentPlaylist();
  if (
    segments.some(
      (segment, index) => Number(segment.filename.slice(8, 14)) !== mediaSequence + index,
    )
  )
    throw new InvalidTorrentPlaylist();
  return { targetDuration, mediaSequence, segments, ended };
}
