import { login, useAuth } from '@/entities/auth';
import {
  focusFirstInvalidField,
  ResendVerification,
  validateLoginForm,
  type LoginFormErrors,
  type LoginFormFields,
} from '@/features/auth-form';
import { Button, Input } from '@/shared';
import { ApiClientError } from '@/shared/api';
import { AuthFormLayout } from '@/widgets/auth-form-layout';
import { useState, type ChangeEvent, type SubmitEvent } from 'react';
import { Link, useNavigate } from 'react-router';

type LoginPageProps = {
  homePath: string;
  registerPath: string;
};

function readLoginFormFields(form: HTMLFormElement): LoginFormFields {
  const formData = new FormData(form);
  const email = formData.get('email');
  const password = formData.get('password');

  return {
    email: typeof email === 'string' ? email : '',
    password: typeof password === 'string' ? password : '',
  };
}

export function LoginPage({ homePath, registerPath }: LoginPageProps) {
  const [formErrors, setFormErrors] = useState<LoginFormErrors>({});
  const { setAuthenticated } = useAuth();
  const navigate = useNavigate();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitting) return;

    const form = event.currentTarget;
    const fields = readLoginFormFields(form);
    const nextFormErrors = validateLoginForm(fields);

    setFormErrors(nextFormErrors);
    setSubmitError(null);
    setVerificationEmail(null);

    const invalidFieldNames = Object.keys(nextFormErrors);

    if (invalidFieldNames.length > 0) {
      requestAnimationFrame(() => focusFirstInvalidField(form, invalidFieldNames));
      return;
    }

    const email = fields.email.trim().toLowerCase();

    setIsSubmitting(true);

    try {
      const { user } = await login({
        email,
        password: fields.password,
      });

      setAuthenticated(user);
      navigate(homePath, { replace: true });
    } catch (error: unknown) {
      if (!(error instanceof ApiClientError)) {
        setSubmitError('Не удалось получить ответ сервера. Проверьте соединение.');
      } else {
        switch (error.status) {
          case 400:
            setSubmitError('Проверьте правильность заполнения полей.');
            break;
          case 401:
            setSubmitError('Неверный email или пароль.');
            break;
          case 403:
            setSubmitError('Подтвердите email перед входом.');
            setVerificationEmail(email);
            break;
          case 429:
            setSubmitError('Слишком много попыток. Подождите минуту и попробуйте снова.');
            break;
          default:
            setSubmitError('Не удалось войти. Попробуйте позже.');
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFieldChange = (
    fieldName: keyof LoginFormFields,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    setSubmitError(null);
    setVerificationEmail(null);

    if (!formErrors[fieldName] || !event.currentTarget.form) {
      return;
    }

    const nextFieldError = validateLoginForm(readLoginFormFields(event.currentTarget.form))[
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
      title="Вход"
      description="Войдите в свой аккаунт yaneMedia."
      footer={
        <p>
          Нет аккаунта?{' '}
          <Link
            to={registerPath}
            className={[
              'font-semibold text-text-primary underline',
              'decoration-border underline-offset-4',
              'transition-colors duration-200 hover:text-watermark',
            ].join(' ')}
          >
            Зарегистрироваться
          </Link>
        </p>
      }
    >
      <form className="flex flex-col gap-2" noValidate onSubmit={handleSubmit}>
        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="name@example.com"
          error={formErrors.email}
          reserveMessageSpace
          required
          onChange={(event) => handleFieldChange('email', event)}
          disabled={isSubmitting}
        />

        <Input
          label="Пароль"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Введите пароль"
          error={formErrors.password}
          reserveMessageSpace
          required
          onChange={(event) => handleFieldChange('password', event)}
          disabled={isSubmitting}
        />

        <Button type="submit" size="large" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? 'Входим…' : 'Войти'}
        </Button>

        {submitError && (
          <p role="alert" className="text-caption text-error">
            {submitError}
          </p>
        )}

        {verificationEmail && (
          <ResendVerification key={verificationEmail} email={verificationEmail} />
        )}
      </form>
    </AuthFormLayout>
  );
}
