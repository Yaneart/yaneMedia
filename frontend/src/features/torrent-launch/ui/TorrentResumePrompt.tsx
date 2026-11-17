import { Button } from '@/shared';

export function TorrentResumePrompt({
  episodic,
  onSelect,
}: {
  episodic: boolean;
  onSelect: () => void;
}) {
  return (
    <div className="space-y-3 text-white" role="status">
      <p>Выберите раздачу для продолжения просмотра</p>
      <p className="text-caption text-white/70">
        {episodic ? 'Серия и позиция сохранены.' : 'Позиция сохранена.'}
      </p>
      <Button onClick={onSelect}>Выбрать раздачу</Button>
    </div>
  );
}
