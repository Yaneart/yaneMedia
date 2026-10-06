import { isCanonicalMediaRef, isMediaRef, type MediaLocator } from '@/entities/media';

export function collectLegacyUserMediaLocators(
  groups: readonly (Iterable<MediaLocator> | undefined)[],
): MediaLocator[] {
  const locators = new Set<MediaLocator>();

  for (const group of groups) {
    if (!group) continue;
    for (const locator of group) {
      if (isMediaRef(locator) && !isCanonicalMediaRef(locator)) locators.add(locator);
    }
  }

  return [...locators].sort();
}
