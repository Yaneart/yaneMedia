export function getCardPosterUrl(url: string): string {
  return url.replace(/^(https?:\/\/image\.tmdb\.org\/t\/p\/)(?:original|w780)\//, '$1w500/');
}
