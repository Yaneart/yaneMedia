import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { PlaybackSessionProvider } from '@/features/playback-session';
import { FavoriteProvider } from '@/features/favorite';
import { OpeningHistoryProvider } from '@/features/opening-history';
import { ThemeProvider } from '@/features/theme';
import { AuthProvider } from '@/app/providers/AuthProvider';
import { RouterProvider } from 'react-router';
import { router } from './router/router';
import { queryClient } from './providers/queryClient';
import {
  editorialQueryPersistOptions,
  isEditorialQueryKey,
} from './providers/editorialQueryPersistence';

function revalidateRestoredEditorialQueries() {
  return queryClient.invalidateQueries({
    predicate: (query) => isEditorialQueryKey(query.queryKey),
    refetchType: 'active',
  });
}

function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={editorialQueryPersistOptions}
      onSuccess={revalidateRestoredEditorialQueries}
    >
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
    </PersistQueryClientProvider>
  );
}
export default App;
