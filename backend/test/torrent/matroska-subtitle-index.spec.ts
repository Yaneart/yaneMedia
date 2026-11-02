import {
  MatroskaIndexUnavailable,
  MatroskaSubtitleIndex,
} from '../../src/torrent/matroska-subtitle-index';

const number = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};
const tag = (id: number, bytes: Buffer) => {
  const hex = id.toString(16);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(bytes.length | 0x10000000);
  return Buffer.concat([Buffer.from(hex.length % 2 ? '0' + hex : hex, 'hex'), size, bytes]);
};
const field = (id: number, n: number) => tag(id, number(n));
function fixture(
  options: {
    relative?: boolean;
    duration?: boolean;
    state?: number;
    simple?: boolean;
    badOffset?: boolean;
  } = {},
) {
  const header = tag(0x1a45dfa3, Buffer.alloc(0));
  const segment = Buffer.from('1853806701ffffffffffffff', 'hex');
  const info = tag(0x1549a966, field(0x2ad7b1, 1_000_000));
  const tracks = tag(
    0x1654ae6b,
    tag(
      0xae,
      Buffer.concat([field(0xd7, 7), field(0x83, 17), tag(0x86, Buffer.from('S_TEXT/UTF8'))]),
    ),
  );
  const timestamp = field(0xe7, 1000);
  const packet = Buffer.concat([Buffer.from([0x87, 0, 5, 0x80]), Buffer.from('Indexed cue')]);
  const block = options.simple
    ? tag(0xa3, packet)
    : tag(0xa0, Buffer.concat([tag(0xa1, packet), field(0x9b, 2000)]));
  const cluster = tag(
    0x1f43b675,
    Buffer.concat([timestamp, block, tag(0xa3, Buffer.alloc(1024 * 1024))]),
  );
  const cues = (position: number) =>
    tag(
      0x1c53bb6b,
      tag(
        0xbb,
        Buffer.concat([
          field(0xb3, 1005),
          tag(
            0xb7,
            Buffer.concat([
              field(0xf7, 7),
              field(0xf1, position),
              ...(options.relative === false
                ? []
                : [field(0xf0, options.badOffset ? 0xffffff : timestamp.length)]),
              ...(options.duration === false ? [] : [field(0xb2, 2000)]),
              field(0xea, options.state ?? 0),
            ]),
          ),
        ]),
      ),
    );
  const index = cues(info.length + tracks.length + cues(0).length);
  const file = Buffer.concat([header, segment, info, tracks, index, cluster]);
  let bytes = 0;
  const read = jest.fn((offset: number, length: number) => {
    if (offset < 0 || offset + length > file.length) throw new Error('Out of bounds');
    bytes += length;
    return Promise.resolve(file.subarray(offset, offset + length));
  });
  return { file, read, bytes: () => bytes };
}

describe('indexed Matroska subtitle input', () => {
  it.each([false, true])(
    'reads only metadata and the selected BlockGroup/SimpleBlock (simple=%s)',
    async (simple) => {
      const f = fixture({ simple });
      const index = await MatroskaSubtitleIndex.load(f.read, f.file.length);
      const input = await index!.window(f.read, 0, 'vtt', 1.1, 1.5);
      expect(input?.includes(Buffer.from('Indexed cue'))).toBe(true);
      expect(input!.length).toBeLessThan(500);
      expect(f.bytes()).toBeLessThan(1500);
      const calls = f.read.mock.calls.length;
      expect(await index!.window(f.read, 0, 'vtt', 5, 8)).toEqual(Buffer.alloc(0));
      expect(f.read.mock.calls.length).toBe(calls);
    },
  );

  it.each([{ relative: false }, { duration: false }, { state: 1 }, { badOffset: true }])(
    'falls back when the index cannot safely locate complete cues: %j',
    async (options) => {
      const f = fixture(options);
      const index = await MatroskaSubtitleIndex.load(f.read, f.file.length);
      expect(await index!.window(f.read, 0, 'vtt', 1, 2)).toBeNull();
    },
  );

  it('does not use another track or codec and rejects malformed/non-Matroska metadata', async () => {
    const f = fixture();
    const index = await MatroskaSubtitleIndex.load(f.read, f.file.length);
    expect(await index!.window(f.read, 1, 'vtt', 1, 2)).toBeNull();
    expect(await index!.window(f.read, 0, 'ass', 1, 2)).toBeNull();
    expect(await index!.window(f.read, 0, 'vtt', 1, 2, 1)).toBeNull();
    const limited = () => Promise.reject(new MatroskaIndexUnavailable('Read limit'));
    expect(await MatroskaSubtitleIndex.load(limited, 100)).toBeNull();
    expect(await index!.window(limited, 0, 'vtt', 1, 2)).toBeNull();
    for (const file of [
      Buffer.alloc(16),
      Buffer.from('1a45dfa30100000000000000', 'hex'),
      Buffer.from('1a45dfa3ffffffff', 'hex'),
    ]) {
      expect(
        await MatroskaSubtitleIndex.load(
          (p, n) => Promise.resolve(file.subarray(p, p + n)),
          file.length,
        ),
      ).toBeNull();
    }
  });

  it('propagates upstream cancellation/failure instead of treating it as a missing index', async () => {
    await expect(
      MatroskaSubtitleIndex.load(() => Promise.reject(new Error('Aborted')), 100),
    ).rejects.toThrow('Aborted');
  });
});
