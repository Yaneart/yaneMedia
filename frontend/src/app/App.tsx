import { ThemeProvider } from '@/features/theme';
import { RouterProvider } from 'react-router';
import { router } from './router/router';

function App() {
  return (
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}

export default App;
