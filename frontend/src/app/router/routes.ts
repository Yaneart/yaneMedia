export const routePaths = {
  home: '/',
  search: '/search',
  movies: '/movies',
  series: '/series',
  anime: '/anime',
  editorialPicks: '/collections/editorial-picks',
  media: '/media/:mediaRef',
  favorites: '/favorites',
  history: '/history',
  profile: '/profile',
  publicProfile: '/u/:handle',
  review: '/reviews/:reviewId',
  login: '/login',
  register: '/register',
  verifyEmail: '/verify-email',
  forgotPassword: '/forgot-password',
  resetPassword: '/reset-password',
  notFound: '*',
} as const;

export function createPublicProfilePath(handle: string): string {
  return `/u/${encodeURIComponent(handle)}`;
}

export function createReviewPath(reviewId: string): string {
  return `/reviews/${encodeURIComponent(reviewId)}`;
}
