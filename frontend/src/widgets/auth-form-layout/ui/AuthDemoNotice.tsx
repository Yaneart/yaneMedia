export function AuthDemoNotice() {
  return (
    <div
      role="status"
      className={[
        'rounded-control border border-watermark/40',
        'bg-watermark/10 px-4 py-3',
        'text-caption text-text-secondary',
      ].join(' ')}
    >
      Серверная авторизация пока не подключена. Данные формы не отправлены и не сохранены.
    </div>
  );
}
