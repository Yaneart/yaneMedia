// Opt-in companion TestLC007Browser stand, on localhost:5174 with Public enabled.
// Real MediaView, helper API, bundled FFmpeg and yanePlayer; no user profile.
import '../src/index.css';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { AuthContext } from '../src/entities/auth/model/authContext';
import { PlaybackSessionProvider } from '../src/features/playback-session';
import { FavoriteProvider } from '../src/features/favorite';
import { MediaView } from '../src/pages/media/ui/MediaView';
import type { MediaDetails } from '../src/entities/media';
const noop = () => {};
const media = {
  mediaRef: 'work_0b02a880-8fdd-43b6-92f2-7a093d9eab60',
  type: 'movie',
  title: 'Local playback fixture',
  slug: 'local-playback-fixture',
  genres: [],
  countries: [],
  languages: [],
  persons: [],
  seasons: [],
} as unknown as MediaDetails;
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <MemoryRouter>
      <AuthContext
        value={{
          state: { status: 'guest', user: null },
          setAuthenticated: noop,
          setGuest: noop,
          refresh: async () => {},
        }}
      >
        <FavoriteProvider>
          <PlaybackSessionProvider>
            <MediaView
              media={media}
              animeSeasonChain={[]}
              onAnimeSeasonChange={noop}
              availability={{
                sources: [],
                episodes: [],
                checkedAt: '',
                degraded: false,
                hasExpiredSources: false,
              }}
              availabilityPending={false}
              availabilityStatus="success"
            />
          </PlaybackSessionProvider>
        </FavoriteProvider>
      </AuthContext>
    </MemoryRouter>
  </QueryClientProvider>,
);
