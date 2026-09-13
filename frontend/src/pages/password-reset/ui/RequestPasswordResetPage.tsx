import { requestPasswordReset } from '@/entities/auth';
import { focusFirstInvalidField, validateEmail } from '@/features/auth-form';
import { Button, createReturnToSearch, Input, parseInternalReturnTo } from '@/shared';
import { ApiClientError } from '@/shared/api';
import { AuthFormLayout } from '@/widgets/auth-form-layout';
import { useState, type ChangeEvent, type SubmitEvent } from 'react';
import { Link, useSearchParams } from 'react-router';

type RequestPasswordResetPageProps = {
  homePath: string;
  loginPath: string;
};

export function RequestPasswordResetPage({ homePath, loginPath }: RequestPasswordResetPageProps) {
  const [searchParams] = useSearchParams();
  const returnTo = parseInternalReturnTo(searchParams.get('returnTo'));
  const loginDestination = returnTo
    ? { pathname: loginPath, search: createReturnToSearch(returnTo) }
    : loginPath;
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isRequested, setIsRequested] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitting) return;

    const form = event.currentTarget;
    const value = new FormData(form).get('email');
    const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
    const validationError = validateEmail(email);

    setEmailError(validationError ?? null);
    setSubmitError(null);

    if (validationError) {
      requestAnimationFrame(() => focusFirstInvalidField(form, ['email']));
      return;
    }

    setIsSubmitting(true);

    try {
      await requestPasswordReset({ email });
      form.reset();
      setIsRequested(true);
    } catch (error: unknown) {
      if (!(error instanceof ApiClientError)) {
        setSubmitError(
          'Не удалось получить ответ сервера. Проверьте соединение и попробуйте снова.',
        );
      } else if (error.status === 400) {
        setSubmitError('Проверьте правильность email.');
      } else if (error.status === 429) {
        setSubmitError('Слишком много запросов. Подождите минуту и попробуйте снова.');
      } else {
        setSubmitError('Не удалось запросить восстановление пароля. Попробуйте позже.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEmailChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSubmitError(null);

    if (!emailError) return;

    setEmailError(validateEmail(event.currentTarget.value) ?? null);
  };

  return (
    <AuthFormLayout
      homePath={homePath}
      title="Восстановление пароля"
      description="Укажите email аккаунта — мы отправим ссылку для создания нового пароля."
      compactMobile
      footer={
        <Link
          to={loginDestination}
          className="font-semibold text-text-primary underline decoration-border underline-offset-4"
        >
          Вернуться ко входу
        </Link>
      }
    >
      {isRequested ? (
        <div className="flex flex-col gap-4">
          <p role="status" className="text-body text-text-primary">
            Если аккаунт с таким email существует, вы получите письмо со ссылкой.
          </p>
          <p className="text-caption text-text-secondary">
            Проверьте также папку «Спам». Ссылка действует один час и используется только один раз.
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setIsRequested(false);
              setEmailError(null);
              setSubmitError(null);
            }}
          >
            Указать другой email
          </Button>
        </div>
      ) : (
        <form className="flex flex-col gap-2" noValidate onSubmit={handleSubmit}>
          <Input
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="name@example.com"
            error={emailError}
            reserveMessageSpace
            required
            disabled={isSubmitting}
            onChange={handleEmailChange}
          />

          <Button type="submit" size="large" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Отправляем…' : 'Получить ссылку'}
          </Button>

          {submitError && (
            <p role="alert" className="text-caption text-error">
              {submitError}
            </p>
          )}
        </form>
      )}
    </AuthFormLayout>
  );
}
