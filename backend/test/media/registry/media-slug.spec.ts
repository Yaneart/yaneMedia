import { createMediaSlug } from '../../../src/media/registry/media-slug';

describe('createMediaSlug', () => {
  it.each([
    ['Frieren: Beyond Journey’s End', 'frieren-beyond-journey-s-end'],
    ['Тетрадь смерти', 'tetrad-smerti'],
    ['  Léon: The Professional  ', 'leon-the-professional'],
  ])('creates a readable route for %s', (title, expected) => {
    expect(createMediaSlug(title)).toBe(expected);
  });
});
