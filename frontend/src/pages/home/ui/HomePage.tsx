import { useNavigate } from 'react-router';

import { demoHomeFeed } from '../model/homeFeed.mock';
import { FeaturedMedia } from '@/widgets/featured-media';

export function HomePage() {
  const navigate = useNavigate();
  const openFeaturedMedia = () => {
    navigate(`/media/${encodeURIComponent(demoHomeFeed.featured.mediaRef)}`);
  };
  return <FeaturedMedia media={demoHomeFeed.featured} onOpen={openFeaturedMedia} />;
}
