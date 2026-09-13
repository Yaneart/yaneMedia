import { resetPassword } from '@/entities/auth';
import {
  focusFirstInvalidField,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  validatePasswordResetForm,
  type PasswordResetFormErrors,
  type PasswordResetFormFields,
} from '@/features/auth-form';
import { Button, Input } from '@/shared';
import { ApiClientError } from '@/shared/api';
import { AuthFormLayout } from '@/widgets/auth-form-layout';
import { useEffect, useState, type ChangeEvent, type SubmitEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';

type ResetPasswordPageProps = {
  homePath: string;
  loginPath: string;
  requestPasswordResetPath: string;
};

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function readFormFields(form: HTMLFormElement): PasswordResetFormFields {
  const formData = new FormData(form);
  const password = formData.get('password');
  const passwordConfirmation = formData.get('passwordConfirmation');

  return {
    password: typeof password === 'string' ? password : '',
    passwordConfirmation: typeof passwordConfirmation === 'string' ? passwordConfirmation : '',
  };
}

export function ResetPasswordPage({
  homePath,
  loginPath,
  requestPasswordResetPath,
}: ResetPasswordPageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(() => {
    const value = new URLSearchParams(location.hash.slice(1)).get('token');

    return value && TOKEN_PATTERN.test(value) ? value : null;
  });
  const [formErrors, setFormErrors] = useState<PasswordResetFormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (!location.hash) return;

    void navigate(
      { pathname: location.pathname, search: location.search, hash: '' },
      { replace: true },
    );
  }, [location.hash, location.pathname, location.search, navigate]);

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!token || isSubmitting || isComplete) return;

    const form = event.currentTarget;
    const fields = readFormFields(form);
    const nextFormErrors = validatePasswordResetForm(fields);

    setFormErrors(nextFormErrors);
    setSubmitError(null);

    const invalidFieldNames = Object.keys(nextFormErrors);
    if (invalidFieldNames.length > 0) {
      requestAnimationFrame(() => focusFirstInvalidField(form, invalidFieldNames));
      return;
    }

    setIsSubmitting(true);

    try {
      await resetPassword({ token, password: fields.password });
      form.reset();
      setToken(null);
      setIsComplete(true);
    } catch (error: unknown) {
      if (!(error instanceof ApiClientError)) {
        setSubmitError(
          'Не удалось получить ответ сервера. Пароль уже мог измениться — попробуйте войти или запросите новую ссылку.',
        );
      } else if (error.status === 400) {
        setToken(null);
        setSubmitError('Ссылка недействительна, устарела или уже была использована.');
      } else if (error.status === 429) {
        setSubmitError('Слишком много попыток. Подождите минуту и попробуйте снова.');
      } else {
        setSubmitError('Не удалось изменить пароль. Попробуйте позже.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFieldChange = (
    fieldName: keyof PasswordResetFormFields,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    setSubmitError(null);

    if (!formErrors[fieldName] || !event.currentTarget.form) return;

    const nextFieldError = validatePasswordResetForm(readFormFields(event.currentTarget.form))[
      fieldName
    ];

    setFormErrors((currentFormErrors) => {
      const nextFormErrors = { ...currentFormErrors };

      if (nextFieldError) {
        nextFormErrors[fieldName] = nextFieldError;
      } else {
        delete nextFormErrors[fieldName];
      }

      return nextFormErrors;
    });
  };

  return (
    <AuthFormLayout
      homePath={homePath}
      title={isComplete ? 'Пароль изменён' : 'Новый пароль'}
      description={
        isComplete
          ? 'Все прежние сеансы завершены. Войдите снова с новым паролем.'
          : 'Придумайте новый пароль для своего аккаунта.'
      }
      compactMobile
      footer={
        <Link
          to={loginPath}
          className="font-semibold text-text-primary underline decoration-border underline-offset-4"
        >
          Перейти ко входу
        </Link>
      }
    >
      {isComplete ? (
        <p role="status" className="text-body text-text-primary">
          Новый пароль сохранён. Автоматический вход не выполнялся.
        </p>
      ) : token ? (
        <form className="flex flex-col gap-2" noValidate onSubmit={handleSubmit}>
          <Input
            label="Новый пароль"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="Введите новый пароль"
            error={formErrors.password}
            hint={`От ${PASSWORD_MIN_LENGTH} до ${PASSWORD_MAX_LENGTH} символов`}
            reserveMessageSpace
            required
            disabled={isSubmitting}
            onChange={(event) => handleFieldChange('password', event)}
          />

          <Input
            label="Повторите новый пароль"
            name="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            placeholder="Введите пароль ещё раз"
            error={formErrors.passwordConfirmation}
            reserveMessageSpace
            required
            disabled={isSubmitting}
            onChange={(event) => handleFieldChange('passwordConfirmation', event)}
          />

          <Button type="submit" size="large" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Сохраняем…' : 'Сохранить пароль'}
          </Button>

          {submitError && (
            <p role="alert" className="text-caption text-error">
              {submitError}
            </p>
          )}
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <p role="alert" className="text-caption text-error">
            {submitError ?? 'В ссылке нет корректного токена восстановления.'}
          </p>
          <Link
            to={requestPasswordResetPath}
            className="inline-flex min-h-11 items-center justify-center rounded-control border border-border bg-control px-4 text-sm font-semibold text-text-primary transition-colors duration-200 hover:border-text-secondary hover:bg-control-hover"
          >
            Запросить новую ссылку
          </Link>
        </div>
      )}
    </AuthFormLayout>
  );
}
