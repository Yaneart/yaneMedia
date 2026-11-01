import { describe, expect, test } from 'bun:test';
import { createPlayerPreferences } from '../src/entities/playback/model/playerPreferences';

function fixture() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } as Storage;
  let owner: string | null = null;
  return {
    values,
    select: (next: string | null) => {
      owner = next;
    },
    adapter: (id: string | null) =>
      createPlayerPreferences(
        id,
        () => owner === id,
        () => storage,
      ),
  };
}
const context = () => ({ signal: new AbortController().signal });

describe('player preference persistence', () => {
  test('restores settings on reopening and isolates guest and accounts', async () => {
    const f = fixture();
    await f.adapter(null).save(
      {
        volume: 0.3,
        muted: true,
        playbackRate: 1.5,
        tracks: { audioLanguages: ['rus'], text: { languages: ['en'], sdh: true } },
        captionStyle: { fontScale: 1.5, color: '#ffffff' },
        captionDelaySeconds: -2,
      },
      context(),
    );
    expect(await f.adapter(null).load(context())).toMatchObject({
      volume: 0.3,
      tracks: { audioLanguages: ['rus'] },
      captionDelaySeconds: -2,
    });
    expect(Object.keys((await f.adapter(null).load(context()))!.captionStyle!)).toEqual([
      'fontScale',
      'color',
    ]);
    f.select('alice');
    expect(await f.adapter('alice').load(context())).toBeNull();
    await f.adapter('alice').save({ volume: 0.8, tracks: { text: null } }, context());
    f.select('bob');
    expect(await f.adapter('bob').load(context())).toBeNull();
    f.select(null);
    expect(await f.adapter(null).load(context())).toMatchObject({ volume: 0.3 });
    f.select('alice');
    expect(await f.adapter('alice').load(context())).toEqual({
      volume: 0.8,
      tracks: { text: null },
    });
  });

  test('drops ephemeral data and rejects cancelled or obsolete saves', async () => {
    const f = fixture(),
      adapter = f.adapter(null);
    await adapter.save(
      {
        volume: 0.4,
        autoCaptions: true,
        source: '/private',
        tracks: {
          audioLanguages: ['en'],
          audioId: 'opaque',
          text: { languages: ['ru'], textId: 'local-file' },
        },
      } as any,
      context(),
    );
    const stored = [...f.values.values()][0];
    expect(stored).not.toMatch(/private|opaque|local-file|autoCaptions/);
    const controller = new AbortController();
    controller.abort();
    await expect(adapter.save({ volume: 1 }, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    f.select('alice');
    await expect(adapter.save({ volume: 1 }, context())).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect([...f.values.values()][0]).toBe(stored);
  });

  test('ignores malformed storage and reports unavailable storage to the player', async () => {
    const f = fixture(),
      adapter = f.adapter(null);
    await adapter.save({}, context());
    const key = [...f.values.keys()][0];
    for (const value of [
      '{',
      '{"version":2}',
      '{"version":1,"preferences":{"volume":2}}',
      '{"version":1,"preferences":{"tracks":{"audioLanguages":["https://private"]}}}',
    ]) {
      f.values.set(key, value);
      expect(await adapter.load(context())).toBeNull();
    }
    const denied = createPlayerPreferences(
      null,
      () => true,
      () => {
        throw new Error('Storage denied');
      },
    );
    await expect(denied.load(context())).rejects.toThrow('Storage denied');
    await expect(denied.save({}, context())).rejects.toThrow('Storage denied');
  });
});
