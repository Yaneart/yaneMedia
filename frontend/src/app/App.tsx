import { PlaybackSessionProvider } from '@/features/playback-session';
import { ThemeProvider } from '@/features/theme';
import { RouterProvider } from 'react-router';
import { router } from './router/router';

function App() {
  return (
    <ThemeProvider>
      <PlaybackSessionProvider>
        <RouterProvider router={router} />
      </PlaybackSessionProvider>
    </ThemeProvider>
  );
}

export default App;
