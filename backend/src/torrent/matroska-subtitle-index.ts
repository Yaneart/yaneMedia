// Read indexed subtitle blocks by byte range, leaving video/audio payloads in
// the torrent. FFmpeg still handles subtitle codecs and Matroska track encodings.
export type MatroskaRangeReader = (
  offset: number,
  length: number,
  signal?: AbortSignal,
) => Promise<Buffer>;
type Element = { id: number; start: number; data: number; end: number };
type Cue = { time: number; duration: number; cluster: number; relative: number };
type Track = {
  number: number;
  streamIndex: number;
  format: string;
  entry: Buffer;
  cues: Cue[];
  indexed: boolean;
};
export class MatroskaIndexUnavailable extends Error {}
const unsupported = (): never => {
  throw new MatroskaIndexUnavailable();
};
const MAX_METADATA = 2 * 1024 * 1024;
const FORMATS: Record<string, string> = {
  'S_TEXT/UTF8': 'vtt',
  'S_TEXT/ASCII': 'vtt',
  'S_TEXT/WEBVTT': 'vtt',
  'S_TEXT/ASS': 'ass',
  'S_TEXT/SSA': 'ass',
  'S_HDMV/PGS': 'pgs',
  S_VOBSUB: 'vobsub',
};

function vint(bytes: Buffer, offset: number, id = false) {
  const first = bytes[offset];
  if (!first) return unsupported();
  const length = Math.clz32(first) - 23;
  if (length > (id ? 4 : 8) || offset + length > bytes.length) return unsupported();
  let value = id ? first : first & (255 >> length);
  for (let i = 1; i < length; i++) value = value * 256 + bytes[offset + i];
  if (!id && value === 2 ** (7 * length) - 1) return { value: -1, length };
  if (!Number.isSafeInteger(value)) return unsupported();
  return { value, length };
}
function element(bytes: Buffer, start: number): Element {
  const id = vint(bytes, start, true),
    size = vint(bytes, start + id.length);
  const data = start + id.length + size.length;
  return { id: id.value, start, data, end: size.value < 0 ? -1 : data + size.value };
}
function children(bytes: Buffer): Element[] {
  const result: Element[] = [];
  for (let offset = 0; offset < bytes.length;) {
    const item = element(bytes, offset);
    if (item.end < item.data || item.end > bytes.length || result.length >= 30_000)
      return unsupported();
    result.push(item);
    offset = item.end;
  }
  return result;
}
function fields(bytes: Buffer) {
  return new Map(children(bytes).map((item) => [item.id, bytes.subarray(item.data, item.end)]));
}
function uint(bytes: Buffer | undefined): number {
  if (!bytes?.length || bytes.length > 6) return unsupported();
  return bytes.readUIntBE(0, bytes.length);
}
function integer(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) return unsupported();
  const size = Math.max(1, Math.ceil(Math.log2(value + 1) / 8));
  const bytes = Buffer.alloc(size);
  bytes.writeUIntBE(value, 0, size);
  return bytes;
}
function wrap(id: number, bytes: Buffer) {
  const tag = integer(id);
  let length = 1;
  while (bytes.length >= 2 ** (7 * length) - 1) length++;
  const size = Buffer.alloc(length);
  size.writeUIntBE(bytes.length, 0, length);
  size[0] |= 1 << (8 - length);
  return Buffer.concat([tag, size, bytes]);
}
async function readHeader(read: MatroskaRangeReader, offset: number, size: number) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + 2 > size) return unsupported();
  const item = element(await read(offset, Math.min(16, size - offset)), 0);
  return {
    ...item,
    start: offset,
    data: offset + item.data,
    unknown: item.end < 0,
    end: item.end < 0 ? size : offset + item.end,
  };
}

export class MatroskaSubtitleIndex {
  private constructor(
    private readonly size: number,
    private readonly segment: number,
    private readonly header: Buffer,
    private readonly info: Buffer,
    private readonly scale: number,
    private readonly tracks: Track[],
  ) {}

  static async load(
    read: MatroskaRangeReader,
    size: number,
  ): Promise<MatroskaSubtitleIndex | null> {
    try {
      const ebml = await readHeader(read, 0, size);
      if (ebml.id !== 0x1a45dfa3 || ebml.end > 4096) return null;
      const segment = await readHeader(read, ebml.end, size);
      if (segment.id !== 0x18538067) return null;
      const positions = new Map<number, number>();
      for (let offset = segment.data, i = 0; i < 32; i++) {
        const item = await readHeader(read, offset, size);
        if (item.end <= item.data || item.end > size) return null;
        positions.set(item.id, offset);
        if (item.id === 0x114d9b74) {
          if (item.end - item.data > 65536) return null;
          const seeks = await read(item.data, item.end - item.data);
          for (const seek of children(seeks).filter((x) => x.id === 0x4dbb)) {
            const values = fields(seeks.subarray(seek.data, seek.end));
            positions.set(uint(values.get(0x53ab)), segment.data + uint(values.get(0x53ac)));
          }
        }
        if (item.id === 0x1f43b675) break;
        offset = item.end;
      }
      const metadata = async (id: number) => {
        const offset = positions.get(id);
        if (offset === undefined) return unsupported();
        const item = await readHeader(read, offset, size);
        if (item.id !== id || item.end > size || item.end - item.data > MAX_METADATA)
          return unsupported();
        return read(item.data, item.end - item.data);
      };
      const info = await metadata(0x1549a966);
      const scaleBytes = fields(info).get(0x2ad7b1);
      const scale = (scaleBytes ? uint(scaleBytes) : 1_000_000) / 1e9;
      if (scale <= 0 || scale > 1) return null;
      const entries = await metadata(0x1654ae6b);
      const tracks: Track[] = [];
      let streamIndex = 0;
      const trackEntries = children(entries).filter((x) => x.id === 0xae);
      if (trackEntries.length > 64) return null;
      for (const entry of trackEntries) {
        const currentIndex = streamIndex++;
        const values = fields(entries.subarray(entry.data, entry.end));
        const format = FORMATS[values.get(0x86)?.toString('utf8') ?? ''];
        if (uint(values.get(0x83)) !== 17 || !format) continue;
        const timing = values.get(0x23314f);
        if (
          timing &&
          ((timing.length !== 4 && timing.length !== 8) ||
            (timing.length === 4 ? timing.readFloatBE() : timing.readDoubleBE()) !== 1)
        )
          return null;
        if (values.has(0x56aa) && uint(values.get(0x56aa)) !== 0) return null;
        tracks.push({
          number: uint(values.get(0xd7)),
          streamIndex: currentIndex,
          format,
          entry: entries.subarray(entry.start, entry.end),
          cues: [],
          indexed: true,
        });
      }
      const cues = await metadata(0x1c53bb6b);
      for (const point of children(cues).filter((x) => x.id === 0xbb)) {
        const data = cues.subarray(point.data, point.end);
        const time = uint(fields(data).get(0xb3));
        for (const position of children(data).filter((x) => x.id === 0xb7)) {
          const values = fields(data.subarray(position.data, position.end));
          const track = tracks.find((x) => x.number === uint(values.get(0xf7)));
          if (!track) continue;
          if (values.has(0xea) && uint(values.get(0xea)) !== 0) {
            track.indexed = false;
            continue;
          }
          track.cues.push({
            time,
            duration: values.has(0xb2) ? uint(values.get(0xb2)) : -1,
            cluster: uint(values.get(0xf1)),
            relative: values.has(0xf0) ? uint(values.get(0xf0)) : -1,
          });
        }
      }
      return new MatroskaSubtitleIndex(
        size,
        segment.data,
        await read(0, ebml.end),
        wrap(0x1549a966, info),
        scale,
        tracks,
      );
    } catch (error) {
      if (error instanceof MatroskaIndexUnavailable) return null;
      throw error;
    }
  }

  needsScan(ordinal: number, start: number, end: number): boolean {
    return (
      this.tracks[ordinal]?.cues.some(
        (cue) =>
          cue.time * this.scale < end &&
          (cue.time + (cue.duration < 0 ? 120 / this.scale : cue.duration)) * this.scale > start &&
          (cue.relative < 0 || cue.duration < 0),
      ) ?? false
    );
  }

  // Incomplete Cues still identify a cluster and timestamp. Walk element
  // headers, skipping AV payloads, and retain only fully verified locations.
  private async scanCluster(read: MatroskaRangeReader, track: Track, cues: Cue[]): Promise<Cue[]> {
    const cluster = await readHeader(read, this.segment + cues[0].cluster, this.size);
    if (cluster.id !== 0x1f43b675 || cluster.unknown || cluster.end > this.size)
      return unsupported();
    const remaining = new Set(cues);
    const resolved = new Map<Cue, Cue>();
    let timestamp: number | undefined;
    for (let offset = cluster.data, count = 0; offset < cluster.end && remaining.size; count++) {
      if (count >= 30_000) return unsupported();
      const item = await readHeader(read, offset, this.size);
      if (item.unknown || item.end <= item.data || item.end > cluster.end) return unsupported();
      offset = item.end;
      if (item.id === 0xe7) {
        timestamp = uint(await read(item.data, item.end - item.data));
        continue;
      }
      if (timestamp === undefined || ![0xa0, 0xa3].includes(item.id)) continue;
      let block = item;
      if (item.id === 0xa0) {
        let found = false;
        for (let pos = item.data, i = 0; pos < item.end && i < 32; i++) {
          const child = await readHeader(read, pos, this.size);
          if (child.unknown || child.end <= child.data || child.end > item.end)
            return unsupported();
          if (child.id === 0xa1) {
            block = child;
            found = true;
            break;
          }
          pos = child.end;
        }
        if (!found) return unsupported();
      }
      const prefix = await read(block.data, Math.min(11, block.end - block.data));
      const number = vint(prefix, 0);
      if (number.value !== track.number) continue;
      if (prefix.length < number.length + 3 || prefix[number.length + 2] & 0x06)
        return unsupported();
      const time = timestamp + prefix.readInt16BE(number.length);
      const cue = [...remaining].find((candidate) => candidate.time === time);
      if (!cue) continue;
      // A SimpleBlock has no independent duration; do not guess from neighbors.
      if (item.id !== 0xa0 || item.end - item.data > 65536) return unsupported();
      const body = fields(await read(item.data, item.end - item.data));
      const duration = uint(body.get(0x9b));
      const relative = item.start - cluster.data;
      if (
        body.has(0xa4) ||
        duration <= 0 ||
        duration * this.scale > 120 ||
        (cue.relative >= 0 && cue.relative !== relative) ||
        (cue.duration >= 0 && cue.duration !== duration)
      )
        return unsupported();
      resolved.set(cue, { ...cue, relative, duration });
      remaining.delete(cue);
    }
    if (remaining.size) return unsupported();
    return cues.map((cue) => resolved.get(cue)!);
  }

  async window(
    read: MatroskaRangeReader,
    ordinal: number,
    format: string,
    start: number,
    end: number,
    streamIndex = ordinal,
    signal?: AbortSignal,
  ): Promise<Buffer | null> {
    let rememberVerified: (() => void) | undefined;
    try {
      const track = this.tracks[ordinal];
      if (
        !track ||
        track.streamIndex !== streamIndex ||
        track.format !== format ||
        !track.indexed ||
        !track.cues.length
      )
        return null;
      signal?.throwIfAborted();
      if (![start, end].every(Number.isFinite) || start < 0 || end <= start) return null;
      const cues = track.cues.filter(
        (x) =>
          (x.time + (x.duration < 0 ? 120 / this.scale : x.duration)) * this.scale > start &&
          x.time * this.scale < end,
      );
      if (cues.length > 256 || (!cues.length && format === 'ass')) return null;
      if (!cues.length) return Buffer.alloc(0);
      const groups = new Map<number, Cue[]>();
      for (const cue of cues) {
        const group = groups.get(cue.cluster) ?? [];
        group.push(cue);
        groups.set(cue.cluster, group);
      }
      const jobs = [...groups.values()].map((originals) => ({
        originals,
        resolved: originals,
        done: false,
      }));
      let next = 0;
      let failure: Error | undefined;
      const abort = new AbortController();
      const jobSignal = signal ? AbortSignal.any([signal, abort.signal]) : abort.signal;
      const guardedRead: MatroskaRangeReader = (offset, length) => {
        jobSignal.throwIfAborted();
        if (failure) throw failure;
        return read(offset, length, jobSignal);
      };
      await Promise.all(
        Array.from({ length: Math.min(4, jobs.length) }, async () => {
          while (next < jobs.length && !failure) {
            const job = jobs[next++];
            try {
              if (job.originals.some((cue) => cue.relative < 0 || cue.duration < 0))
                job.resolved = await this.scanCluster(guardedRead, track, job.originals);
              job.done = true;
            } catch (error) {
              failure ??= error instanceof Error ? error : new Error('Subtitle range failed');
              abort.abort(failure);
            }
          }
        }),
      );
      const remember = () => {
        for (const job of jobs)
          if (job.done) job.originals.forEach((cue, i) => Object.assign(cue, job.resolved[i]));
      };
      rememberVerified = remember;
      if (failure) throw failure;
      signal?.throwIfAborted();
      const located = jobs.flatMap((job) => job.resolved);
      const clusters: Buffer[] = [];
      let bytes = 0;
      for (const cue of located) {
        signal?.throwIfAborted();
        if (cue.duration <= 0 || cue.duration * this.scale > 120) return null;
        if ((cue.time + cue.duration) * this.scale <= start) continue;
        const cluster = await readHeader(read, this.segment + cue.cluster, this.size);
        if (cluster.id !== 0x1f43b675 || cluster.unknown || cluster.end > this.size) return null;
        // Timestamp is a mandatory Cluster child, normally the first one.
        let timestamp: number | undefined;
        for (let offset = cluster.data, i = 0; i < 8; i++) {
          const item = await readHeader(read, offset, this.size);
          if (item.unknown || item.end > cluster.end || item.end - item.data > 65536) break;
          if (item.id === 0xe7) {
            timestamp = uint(await read(item.data, item.end - item.data));
            break;
          }
          offset = item.end;
        }
        if (timestamp === undefined) return null;
        const item = await readHeader(read, cluster.data + cue.relative, this.size);
        if (
          ![0xa0, 0xa3].includes(item.id) ||
          item.unknown ||
          item.end > cluster.end ||
          item.end - item.data > 65536
        )
          return null;
        let body = await read(item.data, item.end - item.data);
        const block = item.id === 0xa0 ? fields(body).get(0xa1) : body;
        if (!block) return null;
        const number = vint(block, 0);
        if (
          number.value !== track.number ||
          block.length < number.length + 3 ||
          block[number.length + 2] & 0x06
        )
          return null;
        if (timestamp + block.readInt16BE(number.length) !== cue.time) return null;
        if (item.id === 0xa3) {
          body = Buffer.from(body);
          body[number.length + 2] &= 0x0e;
          body = Buffer.concat([wrap(0xa1, body), wrap(0x9b, integer(cue.duration))]);
        } else if (fields(body).has(0xa4) || uint(fields(body).get(0x9b)) !== cue.duration)
          return null;
        const output = wrap(
          0x1f43b675,
          Buffer.concat([wrap(0xe7, integer(timestamp)), wrap(0xa0, body)]),
        );
        bytes += output.length;
        if (bytes > MAX_METADATA) return null;
        clusters.push(output);
      }
      signal?.throwIfAborted();
      // A conservative incomplete cue may resolve to a block ending before
      // this window. Header-only Matroska is not decodable subtitle input.
      if (!clusters.length) {
        remember();
        return format === 'vtt' ? Buffer.alloc(0) : null;
      }
      const output = Buffer.concat([
        this.header,
        Buffer.from('1853806701ffffffffffffff', 'hex'),
        this.info,
        wrap(0x1654ae6b, track.entry),
        ...clusters,
      ]);
      if (output.length > MAX_METADATA) return null;
      remember();
      return output;
    } catch (error) {
      if (error instanceof MatroskaIndexUnavailable) return null;
      const reason: unknown = signal?.reason;
      if (
        (!signal?.aborted || (reason instanceof Error && reason.name === 'TimeoutError')) &&
        !(error instanceof Error && error.name === 'AbortError')
      )
        rememberVerified?.();
      throw error;
    }
  }
}
