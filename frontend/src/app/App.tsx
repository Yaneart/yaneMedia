import { QueryClientProvider } from '@tanstack/react-query';
import { PlaybackSessionProvider } from '@/features/playback-session';
import { FavoriteProvider } from '@/features/favorite';
import { OpeningHistoryProvider } from '@/features/opening-history';
import { ThemeProvider } from '@/features/theme';
import { AuthProvider } from '@/app/providers/AuthProvider';
import { RouterProvider } from 'react-router';
import { router } from './router/router';
import { queryClient } from './providers/queryClient';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  );
}
export default App;
