export function createSpoilerExcerpt(body: string, limit = 280): string {
  const characters = Array.from(body.trim());
  return characters.length > limit
    ? `${characters.slice(0, limit).join('')}…`
    : characters.join('');
}
