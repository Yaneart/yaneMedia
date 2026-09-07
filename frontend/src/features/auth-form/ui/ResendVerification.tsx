import { resendVerification } from '@/entities/auth';
import { Button } from '@/shared';
import { ApiClientError } from '@/shared/api';
import { useEffect, useState } from 'react';

type ResendVerificationProps = {
  email: string;
};

export function ResendVerification({ email }: ResendVerificationProps) {
  const [isSending, setIsSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState(() => Date.now() + 60_000);
  const [remainingSeconds, setRemainingSeconds] = useState(60);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));

      setRemainingSeconds(remaining);

      if (remaining === 0) {
        window.clearInterval(timer);
      }
    }, 1000);

    return () => window.clearInterval(timer);
  }, [retryAt]);

  const handleResend = async () => {
    if (isSending || Date.now() < retryAt) {
      return;
    }

    setIsSending(true);
    setMessage(null);
    setError(null);

    try {
      await resendVerification({ email });

      setMessage(
        'Если аккаунт существует и почта ещё не подтверждена, ' +
          'письмо будет отправлено. Проверьте также папку «Спам».',
      );
    } catch (error: unknown) {
      if (!(error instanceof ApiClientError)) {
        setError('Не удалось получить ответ сервера. Проверьте соединение и почту.');
      } else {
        switch (error.status) {
          case 400:
            setError('Проверьте правильность email.');
            break;
          case 429:
            setError('Слишком много запросов. Подождите минуту.');
            break;
          case 503:
            setError('Не удалось отправить письмо. Попробуйте ещё раз через минуту.');
            break;
          default:
            setError('Не удалось запросить письмо. Попробуйте позже.');
        }
      }
    } finally {
      setRetryAt(Date.now() + 60_000);
      setRemainingSeconds(60);
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        variant="secondary"
        disabled={isSending || remainingSeconds > 0}
        onClick={handleResend}
      >
        {isSending
          ? 'Отправляем…'
          : remainingSeconds > 0
            ? `Повторить через ${remainingSeconds} с`
            : 'Отправить письмо повторно'}
      </Button>

      {message && (
        <p role="status" className="text-caption text-text-secondary">
          {message}
        </p>
      )}

      {error && (
        <p role="alert" className="text-caption text-error">
          {error}
        </p>
      )}
    </div>
  );
}
