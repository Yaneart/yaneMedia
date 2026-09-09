import {
  selectMediaDescription,
  selectMediaShortDescription,
} from '../../src/media/media-descriptions';

describe('media description selection', () => {
  it('prefers a Russian full description', () => {
    expect(selectMediaDescription('Русское полное описание.', 'Краткое описание.')).toBe(
      'Русское полное описание.',
    );
  });

  it('prefers a Russian short description over a foreign full fallback', () => {
    expect(selectMediaDescription('English full description.', 'Русское краткое описание.')).toBe(
      'Русское краткое описание.',
    );
  });

  it('falls back to a foreign full description when Russian text is unavailable', () => {
    expect(selectMediaDescription(' English full description. ', 'English short.')).toBe(
      'English full description.',
    );
  });

  it('uses the full Russian text for summaries when the short text is foreign', () => {
    expect(selectMediaShortDescription('English short.', 'Русское полное описание.')).toBe(
      'Русское полное описание.',
    );
  });

  it('returns undefined when no description is available', () => {
    expect(selectMediaDescription('  ', undefined)).toBeUndefined();
  });
});
