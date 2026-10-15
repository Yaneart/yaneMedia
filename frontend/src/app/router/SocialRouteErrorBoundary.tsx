import { useRouteError } from 'react-router';

import { ErrorState } from '@/shared';

export function SocialRouteErrorBoundary() {
  useRouteError();

  return (
    <ErrorState
      variant="page"
      title="Не удалось открыть страницу"
      description="Обновите данные или вернитесь к странице немного позже."
      onRetry={() => window.location.reload()}
    />
  );
}
