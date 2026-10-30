import { EventEmitter } from 'node:events';
import type { Request, Response } from 'express';
import {
  probeSubtitles,
  sidecarSubtitles,
  subtitleWindow,
  mergeSubtitleWindows,
  validateSubtitleFont,
  FONT_BYTES,
} from '../../src/torrent/torrent-subtitle-policy';
import { TorrentSubtitleService } from '../../src/torrent/torrent-subtitle.service';
import type { EngineFileKey } from '../../src/torrent/torrent-engine.port';
import type { TorrentSessionRepository } from '../../src/torrent/torrent-session.repository';
import type { TorrentStreamGateway } from '../../src/torrent/torrent-stream.gateway';

describe('torrent subtitle boundaries', () => {
  it('merges renewed VTT/ASS without duplicate cues or styles and retains overlapping cues', () => {
    const first = 'WEBVTT\n\n00:00:01.000 --> 00:00:06.000\nOverlap\n';
    const next = first + '\n00:00:07.000 --> 00:00:10.000\nNext\n';
    const text = subtitleWindow(mergeSubtitleWindows(first, next, 'vtt'), 'vtt', 4, 10);
    expect(text.match(/Overlap/g)).toHaveLength(1);
    expect(text).toContain('Next');
    const header = '[Script Info]\nTitle: Fixture\n[V4+ Styles]\nStyle: Default\n[Events]\n';
    const event = 'Dialogue: 0,0:00:01.00,0:00:06.00,Default,,0,0,0,,Overlap\n';
    const ass = subtitleWindow(
      mergeSubtitleWindows(header + event, header + event, 'ass'),
      'ass',
      4,
      10,
    );
    expect(ass.match(/Style: Default/g)).toHaveLength(1);
    expect(ass.match(/Dialogue:/g)).toHaveLength(1);
  });
  it('maps only supported codecs and bounded fonts, preserving forced/SDH metadata', () => {
    const result = probeSubtitles([
      {
        index: 2,
        codec_type: 'subtitle',
        codec_name: 'ass',
        tags: { title: '<Русский>\0', language: 'rus' },
        disposition: { forced: 1, hearing_impaired: 1 },
      },
      { index: 3, codec_type: 'subtitle', codec_name: 'hdmv_pgs_subtitle' },
      { index: 4, codec_type: 'attachment', codec_name: 'ttf', extradata_size: 1024 },
      { index: 5, codec_type: 'attachment', codec_name: 'ttf', extradata_size: FONT_BYTES + 1 },
      { index: 6, codec_type: 'attachment', codec_name: 'bin_data', extradata_size: 1024 },
    ]);
    expect(result.subtitleTracks[0]).toMatchObject({
      label: 'Русский',
      language: 'rus',
      format: 'ass',
      isForced: true,
      isSdh: true,
    });
    expect(result.subtitleTracks[0].trackRef).toMatch(/^torrent_subtitle_[\w-]{22}$/);
    expect(result.subtitleTracks[1].format).toBe('pgs');
    expect(result.subtitleFonts).toHaveLength(1);
  });

  it('distinguishes identically named tracks so replacement can restore the chosen one', () => {
    const streams = [2, 3].map((index) => ({
      index,
      codec_type: 'subtitle',
      codec_name: 'subrip',
      tags: { title: 'Русский', language: 'rus' },
    }));
    const tracks = probeSubtitles(streams).subtitleTracks;
    expect(tracks.map((track) => track.label)).toEqual(['Русский (1)', 'Русский (2)']);
    expect(tracks[0].trackRef).not.toBe(tracks[1].trackRef);
  });

  it('pairs sidecars with the exact video and directory, rejecting episode-prefix collisions and oversized files', () => {
    const files = [
      'Show/E01.mkv',
      'Show/E01.rus.forced.srt',
      'Show/E01.eng.sdh.ass',
      'Other/E01.srt',
      'Show/E010.srt',
      'Show/E01.other.srt',
      'Show/E01.srt',
    ];
    const result = sidecarSubtitles(
      files.map((path, index) => ({
        path,
        key: index as EngineFileKey,
        length: index === 6 ? 3 * 1024 * 1024 : 1000,
      })),
      0,
    );
    expect(result.map((item) => [item.language, item.isForced, item.isSdh, item.format])).toEqual([
      ['rus', true, false, 'vtt'],
      ['eng', false, true, 'ass'],
    ]);
    expect(JSON.stringify(result)).not.toContain('Other');
  });

  it('preserves absolute overlapping cues and excludes cues outside the delivered window', () => {
    const output = subtitleWindow(
      'WEBVTT\n\n00:01:59.000 --> 00:02:02.000\noverlap\n\n00:04:01.000 --> 00:04:02.000\nfuture\n',
      'vtt',
      120,
      240,
    );
    expect(output).toContain('00:01:59.000 --> 00:02:02.000');
    expect(output).not.toContain('future');
    expect(subtitleWindow('WEBVTT\n\n', 'vtt', 120, 240)).toContain('WEBVTT');
  });

  it('rejects malformed, excessive-duration and oversized cues; strips embedded ASS resources', () => {
    expect(() =>
      subtitleWindow('WEBVTT\n\n00:00:03.000 --> 00:00:01.000\nbad', 'vtt', 0, 120),
    ).toThrow();
    expect(() =>
      subtitleWindow('WEBVTT\n\n00:00:00.000 --> 00:03:00.000\nbad', 'vtt', 0, 120),
    ).toThrow();
    expect(() => subtitleWindow('x'.repeat(3 * 1024 * 1024), 'ass', 0, 120)).toThrow();
    const ass = subtitleWindow(
      '[Script Info]\nTitle: Test\n[Fonts]\nfontname: unsafe\n[Events]\nDialogue: 0,0:01:59.00,0:02:02.00,Default,,0,0,0,,Overlap',
      'ass',
      120,
      240,
    );
    expect(ass).toContain('Overlap');
    expect(ass).not.toContain('unsafe');
  });

  it('rejects invalid font signatures, oversized fonts and tables outside the payload', () => {
    expect(() => validateSubtitleFont(Buffer.from('<html>'))).toThrow();
    expect(() => validateSubtitleFont(Buffer.alloc(FONT_BYTES + 1))).toThrow();
    const font = Buffer.alloc(28);
    font.writeUInt32BE(0x00010000);
    font.writeUInt16BE(1, 4);
    font.writeUInt32BE(999, 20);
    expect(() => validateSubtitleFont(font)).toThrow();
  });
});

describe('owner and generation checks for subtitle delivery', () => {
  const id = 'torrent_session_abcdefghijklmnopqrstuv';
  const ref = 'torrent_subtitle_abcdefghijklmnopqrstuv';
  const session = {
    state: 'ready',
    generation: 2,
    selectedFileRef: 'file',
    playbackTimeline: { absoluteAnchorSeconds: 120 },
  };
  const resource = { trackRef: ref, format: 'vtt' };
  const findVisible = jest.fn();
  const extract = jest.fn();
  const repository = {
    findVisible,
    getProbe: async () => ({ fileRef: 'file', subtitleTracks: [resource] }),
    findFile: async () => ({ engineFileIndex: 0, sizeBytes: 100 }),
    findEngineKey: async () => 'key',
  } as unknown as TorrentSessionRepository;
  const service = new TorrentSubtitleService(repository, {
    subtitleResource: extract,
  } as unknown as TorrentStreamGateway);
  const request = { headers: {} } as Request;
  const response = () =>
    Object.assign(new EventEmitter(), {
      setHeader: jest.fn(),
      end: jest.fn(),
      status: jest.fn().mockReturnThis(),
    }) as unknown as Response;
  beforeEach(() => {
    findVisible.mockReset().mockResolvedValue(session);
    extract.mockReset().mockResolvedValue(Buffer.from('WEBVTT'));
  });

  it('conceals foreign, stale, stopped and unknown references with the same 404', async () => {
    for (const [visible, generation, track] of [
      [undefined, '2', ref],
      [session, '1', ref],
      [{ ...session, state: 'stopping' }, '2', ref],
      [session, '2', ref.replace('a', 'z')],
    ] as const) {
      findVisible.mockResolvedValue(visible);
      await expect(
        service.serve('owner', id, generation, track, false, request, response()),
      ).rejects.toMatchObject({ status: 404 });
    }
    expect(extract).not.toHaveBeenCalled();
  });

  it('rechecks ownership/generation after extraction, never serving a replaced window', async () => {
    findVisible.mockResolvedValueOnce(session).mockResolvedValueOnce({ ...session, generation: 3 });
    const res = response();
    await expect(service.serve('owner', id, '2', ref, false, request, res)).rejects.toMatchObject({
      status: 404,
    });
    expect(res.end).not.toHaveBeenCalled();
  });

  it('rejects Range without starting a job and serves an owned text resource with its MIME type', async () => {
    const ranged = response();
    await service.serve(
      'owner',
      id,
      '2',
      ref,
      false,
      { headers: { range: 'bytes=0-' } } as Request,
      ranged,
    );
    expect(ranged.status).toHaveBeenCalledWith(416);
    expect(extract).not.toHaveBeenCalled();
    const res = response();
    await service.serve('owner', id, '2', ref, false, request, res);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/vtt; charset=utf-8');
    expect(res.end).toHaveBeenCalledWith(Buffer.from('WEBVTT'));
    expect(res.listenerCount('close')).toBe(0);
  });

  it('cancels the worker on disconnect and suppresses its late output', async () => {
    const res = response();
    extract.mockImplementation(async (...args: unknown[]) => {
      const signal = args[6] as AbortSignal;
      res.emit('close');
      expect(signal.aborted).toBe(true);
      throw new Error('aborted');
    });
    await service.serve('owner', id, '2', ref, false, request, res);
    expect(res.end).not.toHaveBeenCalled();
  });
});
