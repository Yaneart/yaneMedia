import { afterEach, expect, mock, test } from 'bun:test';
import type { PlayerEvent, YanePlayerElement } from '@yaneart/yaneplayer';
import {
  createLocalTrackStream,
  localTrackSource,
  type LocalMediaSource,
} from '../src/features/companion/model/localTracks';

const base = `http://127.0.0.1:45723/v1/media/${'a'.repeat(64)}/`;
const textRef = 'b'.repeat(64);
const source = (): LocalMediaSource => ({
  id: 'file',
  revision: 2,
  type: 'hls',
  url: base + 'master.m3u8',
  timeline: {
    mode: 'windowed-vod',
    continuous: true,
    absoluteAnchorSeconds: 89.6,
    mediaAnchorSeconds: 0.08,
    durationSeconds: 200,
  },
  audioTracks: [
    {
      audioRef: 'c'.repeat(64),
      label: 'Russian',
      language: 'rus',
      codec: 'aac',
      channels: 2,
      default: false,
    },
  ],
  textTracks: [
    {
      textRef,
      label: 'English',
      language: 'eng',
      format: 'ass',
      default: false,
      forced: true,
      sdh: true,
      available: true,
      url: `${base}text-${textRef}.ass`,
      fonts: [`${base}font-${'d'.repeat(64)}.bin`],
    },
  ],
});
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

test('maps real track descriptions, absolute clocks and strict anonymous MSE requests', () => {
  const value = localTrackSource(source());
  expect(value.hlsPlayback).toBe('mse');
  expect(value.request).toEqual({
    allowedOrigins: ['http://127.0.0.1:45723'],
    credentials: 'omit',
  });
  expect(value.subtitles?.[0]).toMatchObject({
    id: textRef,
    forced: true,
    sdh: true,
    available: true,
  });
  expect(value.subtitles?.[0].fonts?.[0].request?.credentials).toBe('omit');
  expect(value.timeline?.absoluteAnchorSeconds).toBe(89.6);
  expect(value.audioTracks?.[0].language).toBe('rus');
  const bitmap = source();
  bitmap.textTracks[0] = {
    ...bitmap.textTracks[0],
    format: 'pgs',
    available: false,
    unavailableReason: 'BITMAP_SUBTITLES_UNSUPPORTED',
    url: `${base}text-${textRef}.pgs`,
    fonts: [],
  };
  expect(localTrackSource(bitmap).subtitles?.[0].unavailableReason).toBe(
    'Графические субтитры PGS/VobSub пока не поддерживаются.',
  );
  const unknown = source();
  unknown.textTracks[0] = {
    ...unknown.textTracks[0],
    available: false,
    unavailableReason: 'SUBTITLE_CODEC_UNSUPPORTED',
    format: 'vtt',
    url: `${base}text-${textRef}.vtt`,
    fonts: [],
  };
  expect(localTrackSource(unknown).subtitles?.[0].unavailableReason).toBe(
    'Формат этой дорожки субтитров пока не поддерживается.',
  );
});

test('rejects foreign resource origins, another generation grant and arbitrary paths', () => {
  for (const url of [
    'https://remote.example/font.ttf',
    base + '../private.ttf',
    base.replace('a'.repeat(64), 'e'.repeat(64)) + `text-${textRef}.ass`,
  ]) {
    const value = source();
    value.textTracks[0].url = url;
    expect(() => localTrackSource(value)).toThrow('INVALID_LOCAL_MEDIA');
    const font = source();
    font.textTracks[0].fonts = [url];
    expect(() => localTrackSource(font)).toThrow('INVALID_LOCAL_MEDIA');
  }
});

test('feeds confirmed progress while captions load, and Off cancels a pending refresh', async () => {
  const s = source();
  let snapshot = {
    source: { id: s.id, revision: String(s.revision) },
    positionSeconds: 90,
    pending: null,
    selection: { textId: `subtitle:${textRef}` },
    intent: 'playing',
  } as PlayerEvent['snapshot'];
  const selectText = mock(async () => {});
  const player = {
    runtime: { getSnapshot: () => snapshot },
    selectText,
  } as unknown as YanePlayerElement;
  const report = mock(async () => {});
  const stream = createLocalTrackStream(player, report);
  let resolve!: (value: Response) => void;
  let signal!: AbortSignal;
  globalThis.fetch = mock((_url, options) => {
    signal = options?.signal as AbortSignal;
    expect(options?.credentials).toBe('omit');
    expect(options?.redirect).toBe('error');
    return new Promise<Response>((done) => {
      resolve = done;
    });
  }) as typeof fetch;
  stream.configure(s);
  stream.update({ ...snapshot, pending: { type: 'audio' } } as PlayerEvent['snapshot']);
  expect(report).not.toHaveBeenCalled();
  stream.update({
    ...snapshot,
    pending: { type: 'audio' },
    playback: 'playing',
    captions: { status: 'loading' },
  } as PlayerEvent['snapshot']);
  expect(report).toHaveBeenCalledWith(s, 90, expect.any(AbortSignal));
  stream.update(snapshot);
  snapshot = { ...snapshot, positionSeconds: 102 };
  stream.update(snapshot);
  expect(selectText).not.toHaveBeenCalled();
  resolve(new Response('ASS', { headers: { 'X-Yane-Text-End': '160' } }));
  await settle();
  expect(selectText).toHaveBeenCalledWith(`subtitle:${textRef}`);
  snapshot = { ...snapshot, positionSeconds: 125 };
  stream.update(snapshot);
  snapshot = { ...snapshot, selection: { ...snapshot.selection, textId: null } };
  stream.update(snapshot);
  expect(signal.aborted).toBe(true);
  resolve(new Response('ASS', { headers: { 'X-Yane-Text-End': '180' } }));
  await settle();
  expect(selectText).toHaveBeenCalledTimes(1);
  stream.dispose();
});

test('a replacement prevents late caption publication and never fetches stale URLs', async () => {
  const s = source();
  const snapshot = {
    source: { id: s.id, revision: '2' },
    positionSeconds: 90,
    pending: null,
    selection: { textId: `subtitle:${textRef}` },
  } as PlayerEvent['snapshot'];
  const selectText = mock(async () => {});
  const player = {
    runtime: { getSnapshot: () => snapshot },
    selectText,
  } as unknown as YanePlayerElement;
  const report = mock(async () => {});
  const stream = createLocalTrackStream(player, report);
  let resolve!: (value: Response) => void;
  let signal!: AbortSignal;
  globalThis.fetch = mock((_url, options) => {
    signal = options?.signal as AbortSignal;
    return new Promise<Response>((done) => {
      resolve = done;
    });
  }) as typeof fetch;
  stream.configure(s);
  stream.update(snapshot);
  stream.update({ ...snapshot, positionSeconds: 102 });
  stream.configure({ ...s, revision: 3 });
  expect(signal.aborted).toBe(true);
  resolve(new Response('ASS', { headers: { 'X-Yane-Text-End': '200' } }));
  await settle();
  stream.update(snapshot);
  expect(selectText).not.toHaveBeenCalled();
  expect(report).toHaveBeenCalledTimes(1);
  stream.dispose();
});
