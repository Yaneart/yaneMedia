import { verifyEmail } from '@/entities/auth';
import { ResendVerification, validateEmail } from '@/features/auth-form';
import { Button, Input } from '@/shared';
import { ApiClientError } from '@/shared/api';
import { AuthFormLayout } from '@/widgets/auth-form-layout';
import { useEffect, useState, type SubmitEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';

type VerifyEmailPageProps = {
  homePath: string;
  loginPath: string;
};

export function VerifyEmailPage({ homePath, loginPath }: VerifyEmailPageProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const [token, setToken] = useState<string | null>(() => {
    const value = new URLSearchParams(location.hash.slice(1)).get('token');

    return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryEmail, setRecoveryEmail] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    if (location.hash) {
      void navigate(
        { pathname: location.pathname, search: location.search, hash: '' },
        { replace: true },
      );
    }
  }, [location.hash, location.pathname, location.search, navigate]);

  const handleVerify = async () => {
    if (!token || isSubmitting || isVerified) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await verifyEmail({ token });
      setToken(null);
      setIsVerified(true);
    } catch (error: unknown) {
      if (!(error instanceof ApiClientError)) {
        setError(
          'Не удалось получить ответ сервера. Подтверждение уже могло выполниться. ' +
            'Попробуйте войти или повторите запрос.',
        );
      } else if (error.status === 400) {
        setToken(null);
        setError('Ссылка недействительна, устарела или уже использована.');
      } else if (error.status === 429) {
        setError('Слишком много попыток. Подождите минуту и повторите запрос.');
      } else {
        setError('Не удалось подтвердить почту. Попробуйте позже.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecoverySubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = event.currentTarget;
    const value = new FormData(form).get('email');
    const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
    const validationError = validateEmail(email);

    setEmailError(validationError ?? null);

    if (validationError) {
      form.querySelector<HTMLInputElement>('input[name="email"]')?.focus();
      return;
    }

    setRecoveryEmail(email);
  };

  return (
    <AuthFormLayout
      homePath={homePath}
      title="Подтверждение почты"
      description="Подтвердите email, чтобы войти в аккаунт."
      compactMobile
      footer={
        <Link to={loginPath} className="font-semibold text-text-primary underline">
          Перейти ко входу
        </Link>
      }
    >
      <div className="flex flex-col gap-3">
        {isVerified ? (
          <p role="status" className="text-text-primary">
            Почта подтверждена. Теперь можно войти в аккаунт.
          </p>
        ) : (
          <>
            {!token && !error && (
              <p role="alert" className="text-caption text-error">
                В ссылке нет корректного токена. Откройте ссылку из письма.
              </p>
            )}

            {token && (
              <Button type="button" disabled={isSubmitting} onClick={handleVerify}>
                {isSubmitting ? 'Подтверждаем…' : 'Подтвердить email'}
              </Button>
            )}

            {error && (
              <p role="alert" className="text-caption text-error">
                {error}
              </p>
            )}

            {!token && (
              <div className="flex flex-col gap-3">
                {recoveryEmail ? (
                  <>
                    <p className="text-text-secondary">
                      Запросить новую ссылку для {recoveryEmail}
                    </p>

                    <ResendVerification key={recoveryEmail} email={recoveryEmail} />

                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        setRecoveryEmail(null);
                        setEmailError(null);
                      }}
                    >
                      Изменить email
                    </Button>
                  </>
                ) : (
                  <form className="flex flex-col gap-3" noValidate onSubmit={handleRecoverySubmit}>
                    <Input
                      label="Email аккаунта"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="name@example.com"
                      error={emailError}
                      onChange={() => setEmailError(null)}
                      required
                    />

                    <Button type="submit" variant="secondary">
                      Запросить новую ссылку
                    </Button>
                  </form>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AuthFormLayout>
  );
}
