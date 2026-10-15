export const loadProfilePage = () =>
  import('@/pages/profile').then(({ ProfilePage }) => ({ default: ProfilePage }));

export const loadPublicProfilePage = () =>
  import('@/pages/public-profile').then(({ PublicProfilePage }) => ({
    default: PublicProfilePage,
  }));

export const loadReviewPage = () =>
  import('@/pages/review').then(({ ReviewPage }) => ({ default: ReviewPage }));
