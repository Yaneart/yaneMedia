import { TorrentAudioRenditions } from '../../src/torrent/torrent-audio-renditions';
import type { TorrentProbe } from '../../src/torrent/torrent-media-policy';
import type { TorrentSource } from '../../src/torrent/torrent-audio-renditions';

describe('source-scoped audio preparation', () => {
  const source = {} as TorrentSource;
  const probe = {
    videoEndSeconds: 24,
    audioTracks: [
      { trackRef: 'first', endSeconds: 24 },
      { trackRef: 'second', endSeconds: 28 },
    ],
  } as TorrentProbe;
  function fixture() {
    const active = new Set<string>();
    const port = {
      start: jest.fn(async (id: string) => {
        active.add(id);
      }),
      ready: jest.fn(async () => ({
        continuous: true,
        absoluteAnchorSeconds: 12,
        mediaAnchorSeconds: 0,
        windowEndSeconds: 24,
      })),
      stop: jest.fn(async (id: string) => {
        active.delete(id);
      }),
      freeze: jest.fn(async () => {}),
      has: (id: string) => active.has(id),
      ended: () => true,
      covers: () => true,
      confirm: jest.fn(() => true),
    };
    return { port, renditions: new TorrentAudioRenditions(port) };
  }

  it('keeps audible audio on failed preparation and cleans the unpublished child', async () => {
    const { port, renditions } = fixture();
    await renditions.prepare('source', 1, source, probe, probe.audioTracks[0], 12);
    const initial = renditions.get('source', 1)!.audio;
    port.ready.mockRejectedValueOnce(new Error('input interrupted'));
    await expect(renditions.select('source', 1, 'second', 14, probe)).rejects.toThrow(
      'input interrupted',
    );
    expect(renditions.get('source', 1)!.audio).toBe(initial);
    expect(port.freeze).not.toHaveBeenCalled();
    expect(port.stop).toHaveBeenCalledWith(port.start.mock.calls.at(-1)![0], 1);
    await renditions.select('source', 1, 'second', 14, probe);
    expect(renditions.get('source', 1)!.retired).toBe(initial);
    expect(port.freeze).toHaveBeenCalledWith(initial!.id, 1);
  });

  it('Stop aborts pending preparation, preserves newer generations and joins child cleanup', async () => {
    const { port, renditions } = fixture();
    await renditions.prepare('source', 2, source, probe, probe.audioTracks[0], 12);
    await renditions.stop('source', 1);
    expect(renditions.get('source', 2)).toBeDefined();
    let entered!: () => void;
    const waiting = new Promise<void>((resolve) => {
      entered = resolve;
    });
    port.ready.mockImplementationOnce(
      (_id?: unknown, _generation?: unknown, signal?: AbortSignal) => {
        entered();
        return new Promise((_resolve, reject) =>
          signal!.addEventListener('abort', () => reject(signal!.reason), { once: true }),
        );
      },
    );
    const selection = renditions.select('source', 2, 'second', 14, probe);
    const rejected = expect(selection).rejects.toBeDefined();
    await waiting;
    await renditions.stop('source', 2);
    await rejected;
    expect(renditions.get('source', 2)).toBeUndefined();
    expect(renditions.protectedIds().size).toBe(0);
    for (const [id] of port.start.mock.calls.filter(([id]) => id !== 'source'))
      expect(port.stop).toHaveBeenCalledWith(id, 2);
  });

  it('confirms the selected longer audio tail without inventing video progress', async () => {
    const { port, renditions } = fixture();
    await renditions.prepare('source', 1, source, probe, probe.audioTracks[0], 12);
    await renditions.select('source', 1, 'second', 23, probe);
    expect(renditions.confirm('source', 1, 27)).toBe(true);
    expect(port.confirm).toHaveBeenCalledWith('source', 1, 24);
    expect(renditions.get('source', 1)!.position).toBe(27);
    expect(renditions.confirm('source', 1, 29)).toBe(false);
  });
});
