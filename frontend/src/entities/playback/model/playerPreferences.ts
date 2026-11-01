import type { PlayerPreferences, PreferencesAdapter } from '@yaneart/yaneplayer';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('Invalid player preferences');
  return value as Record<string, unknown>;
}

// Persist descriptive settings only: never URLs, track IDs, local files or recognition state.
function sanitize(value: unknown): PlayerPreferences {
  const input = record(value);
  const result: Record<string, unknown> = {};
  for (const [key, min, max] of [
    ['volume', 0, 1],
    ['playbackRate', 0.1, 4],
    ['captionDelaySeconds', -60, 60],
  ] as const) {
    const number = input[key];
    if (number === undefined) continue;
    if (typeof number !== 'number' || !Number.isFinite(number) || number < min || number > max)
      throw new TypeError('Invalid preference range');
    result[key] = number;
  }
  for (const key of ['muted', 'preservesPitch'] as const) {
    if (input[key] === undefined) continue;
    if (typeof input[key] !== 'boolean') throw new TypeError('Invalid preference flag');
    result[key] = input[key];
  }
  const languages = (value: unknown) => {
    if (value === undefined) return undefined;
    if (
      !Array.isArray(value) ||
      value.length > 8 ||
      value.some(
        (language) =>
          typeof language !== 'string' || !/^[a-z]{2,3}(?:-[a-z0-9]{1,8})*$/i.test(language),
      )
    )
      throw new TypeError('Invalid language preference');
    return value;
  };
  if (input.tracks !== undefined) {
    const tracks = record(input.tracks);
    const text = tracks.text == null ? null : record(tracks.text);
    for (const key of ['forced', 'sdh'])
      if (text?.[key] !== undefined && typeof text[key] !== 'boolean')
        throw new TypeError('Invalid subtitle preference');
    result.tracks = {
      audioLanguages: languages(tracks.audioLanguages),
      text: text
        ? { languages: languages(text.languages), forced: text.forced, sdh: text.sdh }
        : null,
    };
  }
  if (input.captionStyle !== undefined) {
    const style = record(input.captionStyle);
    const { fontScale, color, background, edge, presentation } = style;
    if (
      (fontScale !== undefined &&
        (typeof fontScale !== 'number' ||
          !Number.isFinite(fontScale) ||
          fontScale < 0.75 ||
          fontScale > 2)) ||
      (color !== undefined && (typeof color !== 'string' || !/^#[\da-f]{6}$/i.test(color))) ||
      (background !== undefined &&
        (typeof background !== 'string' ||
          (background !== 'transparent' && !/^#[\da-f]{6}([\da-f]{2})?$/i.test(background)))) ||
      (edge !== undefined && !['none', 'outline', 'shadow'].includes(String(edge))) ||
      (presentation !== undefined && !['native', 'card'].includes(String(presentation)))
    )
      throw new TypeError('Invalid caption style');
    result.captionStyle = Object.fromEntries(
      Object.entries({ fontScale, color, background, edge, presentation }).filter(
        ([, value]) => value !== undefined,
      ),
    );
  }
  return result as PlayerPreferences;
}

export function createPlayerPreferences(
  ownerId: string | null,
  isCurrent: () => boolean,
  storage: () => Storage = () => window.localStorage,
): PreferencesAdapter {
  const key = `yanemedia-player-preferences:${ownerId === null ? 'guest' : `account:${encodeURIComponent(ownerId)}`}`;
  const check = (signal: AbortSignal) => {
    signal.throwIfAborted();
    if (!isCurrent()) throw new DOMException('Playback owner changed', 'AbortError');
  };
  return {
    async load({ signal }) {
      check(signal);
      const serialized = storage().getItem(key);
      if (!serialized) return null;
      try {
        const stored = record(JSON.parse(serialized));
        return stored.version === 1 ? sanitize(stored.preferences) : null;
      } catch {
        return null;
      }
    },
    async save(preferences, { signal }) {
      check(signal);
      storage().setItem(key, JSON.stringify({ version: 1, preferences: sanitize(preferences) }));
    },
  };
}
