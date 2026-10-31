import { afterEach, expect, mock, test } from 'bun:test';
import {
  torrentClientCapabilities,
  type TorrentClientMedia,
} from '../src/entities/torrent-session/model/torrentClientCapabilities';
import { validTorrentOutput } from '../src/entities/torrent-session/api/validTorrentOutput';
import { validTorrentClientMedia } from '../src/entities/torrent-session/api/validTorrentClientMedia';

const descriptors = new Map(
  ['document', 'navigator', 'MediaSource', 'ManagedMediaSource'].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]),
);
afterEach(() => {
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});
const media: TorrentClientMedia = {
  video: {
    contentType: 'video/mp4; codecs="hvc1.2.4.L153.B0"',
    width: 3840,
    height: 1608,
    framerate: 24,
    bitrate: 40_000_000,
  },
  audio: [
    {
      trackRef: 'ac3',
      contentType: 'audio/mp4; codecs="ac-3"',
      channels: 6,
      samplerate: 48_000,
      bitrate: 384_000,
    },
    { trackRef: 'truehd', contentType: null, channels: 8, samplerate: 48_000, bitrate: 1_536_000 },
  ],
};
function browser(
  decode?: (config: MediaDecodingConfiguration) => Promise<Partial<MediaCapabilitiesDecodingInfo>>,
  native = false,
) {
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { createElement: () => ({ canPlayType: () => 'probably' }) },
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaCapabilities: decode ? { decodingInfo: decode } : undefined },
  });
  Object.defineProperty(globalThis, 'MediaSource', {
    configurable: true,
    value: native ? undefined : { isTypeSupported: () => true },
  });
  Reflect.deleteProperty(globalThis, 'ManagedMediaSource');
}

test('queries exact 4K codec/depth/size/fps/bitrate and original audio through the selected transport', async () => {
  for (const native of [false, true]) {
    const decode = mock(async (_config: MediaDecodingConfiguration) => ({
      supported: true,
      smooth: true,
    }));
    browser(decode, native);
    expect(await torrentClientCapabilities(media, 'ac3')).toEqual({
      originalVideo: true,
      audio: 'original',
    });
    expect(decode.mock.calls[0][0]).toEqual({
      type: native ? 'file' : 'media-source',
      video: media.video,
    });
    expect(decode.mock.calls[1][0].audio?.channels).toBe('6');
  }
});

test('converts unsupported original audio to verified AAC 7.1/5.1 or stereo without disabling original video', async () => {
  for (const max of [8, 6, 2]) {
    browser(async (config) => ({
      supported: !config.audio || Number(config.audio.channels) <= max,
      smooth: true,
    }));
    expect(await torrentClientCapabilities(media, 'truehd')).toEqual({
      originalVideo: true,
      audio: `aac-${max}`,
    });
  }
});

test('rejects slow original video and treats missing/failed/stalled capabilities conservatively', async () => {
  browser(async () => ({ supported: true, smooth: false }));
  expect(await torrentClientCapabilities(media, 'ac3')).toEqual({
    originalVideo: false,
    audio: 'original',
  });
  for (const decode of [
    undefined,
    async () => {
      throw new Error('unsupported API');
    },
    () => new Promise<never>(() => {}),
  ]) {
    browser(decode);
    expect(await torrentClientCapabilities(media)).toEqual({
      originalVideo: false,
      audio: 'aac-2',
    });
  }
});

test('keeps confirmed original video when only audio capability negotiation stalls', async () => {
  browser((config) =>
    config.video ? Promise.resolve({ supported: true, smooth: true }) : new Promise(() => {}),
  );
  expect(await torrentClientCapabilities(media)).toEqual({ originalVideo: true, audio: 'aac-2' });
});

test('accepts original 4K HDR and multichannel outputs, rejects colour conversion and malformed metadata', () => {
  const output = {
    profile: 'h264-1080p',
    source: {
      codec: 'hevc',
      width: 3840,
      height: 1608,
      bitDepth: 10,
      fps: 24,
      dynamicRange: 'sdr',
    },
    video: {
      codec: 'hevc',
      width: 3840,
      height: 1608,
      bitDepth: 10,
      fps: 24,
      dynamicRange: 'sdr',
      mode: 'copy',
      reason: 'compatible',
    },
    audio: {
      codec: 'eac3',
      sourceCodec: 'eac3',
      sourceChannels: 8,
      channels: 8,
      mode: 'copy',
      reason: 'compatible',
    },
  };
  expect(validTorrentOutput(output)).toBe(true);
  const hdr = {
    ...output,
    source: { ...output.source, dynamicRange: 'hdr' },
    video: { ...output.video, dynamicRange: 'hdr' },
  };
  expect(validTorrentOutput(hdr)).toBe(true);
  expect(validTorrentOutput({ ...hdr, video: { ...hdr.video, mode: 'transcode' } })).toBe(false);
  expect(validTorrentOutput({ ...output, video: { ...output.video, mode: 'transcode' } })).toBe(
    false,
  );
  expect(validTorrentOutput({ ...output, source: { ...output.source, dynamicRange: 'hdr' } })).toBe(
    false,
  );
  expect(validTorrentClientMedia(media)).toBe(true);
  expect(
    validTorrentClientMedia({
      ...media,
      video: { ...media.video, contentType: 'file:///etc/passwd' },
    }),
  ).toBe(false);
  expect(validTorrentClientMedia({ ...media, video: { ...media.video, width: 8192 } })).toBe(false);
});
