import { PlaybackSessionProvider } from '@/features/playback-session';
import { ThemeProvider } from '@/features/theme';
import { RouterProvider } from 'react-router';
import { router } from './router/router';
import { FavoriteProvider } from '@/features/favorite';
import { OpeningHistoryProvider } from '@/features/opening-history';
import { AuthProvider } from '@/app/providers/AuthProvider';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <FavoriteProvider>
          <OpeningHistoryProvider>
            <PlaybackSessionProvider>
              <RouterProvider router={router} />
            </PlaybackSessionProvider>
          </OpeningHistoryProvider>
        </FavoriteProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
export default App;
