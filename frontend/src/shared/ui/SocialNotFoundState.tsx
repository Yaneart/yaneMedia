import { ErrorState } from './ErrorState';

export function SocialNotFoundState({ kind }: { kind: 'profile' | 'review' }) {
  return (
    <ErrorState
      variant="page"
      tone="accent"
      eyebrow="Ничего не найдено"
      visualCode="404"
      visualLabel="Страница недоступна"
      title={kind === 'profile' ? 'Профиль не найден' : 'Рецензия не найдена'}
      description="Ссылка могла устареть, либо материал больше недоступен."
    />
  );
}
