import { PlaybackSessionProvider } from '@/features/playback-session';
import { ThemeProvider } from '@/features/theme';
import { RouterProvider } from 'react-router';
import { router } from './router/router';
import { FavoriteProvider } from '@/features/favorite';

function App() {
  return (
    <ThemeProvider>
      <FavoriteProvider>
        <PlaybackSessionProvider>
          <RouterProvider router={router} />
        </PlaybackSessionProvider>
      </FavoriteProvider>
    </ThemeProvider>
  );
}
export default App;
