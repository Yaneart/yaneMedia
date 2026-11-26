const TMDB_CARD_POSTER = /^(https?:\/\/image\.tmdb\.org\/t\/p\/)(?:original|w780)\//;

export function getCardPosterUrl(url: string): string {
  if (!url.includes('/api/v1/media/artwork/external?')) {
    return url.replace(TMDB_CARD_POSTER, '$1w500/');
  }

  const proxy = new URL(url, 'http://localhost');
  const source = proxy.searchParams.get('url');
  if (!source || !TMDB_CARD_POSTER.test(source)) return url;
  proxy.searchParams.set('url', source.replace(TMDB_CARD_POSTER, '$1w500/'));
  return url.startsWith('/') ? `${proxy.pathname}${proxy.search}${proxy.hash}` : proxy.href;
}
