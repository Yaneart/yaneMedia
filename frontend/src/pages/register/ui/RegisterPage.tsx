import { register } from '@/entities/auth';
import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  ResendVerification,
  focusFirstInvalidField,
  validateRegisterForm,
  type RegisterFormErrors,
  type RegisterFormFields,
} from '@/features/auth-form';
import { Button, createReturnToSearch, Input, parseInternalReturnTo } from '@/shared';
import { ApiClientError } from '@/shared/api';
import { AuthFormLayout } from '@/widgets/auth-form-layout';
import { useState, type ChangeEvent, type SubmitEvent } from 'react';
import { Link, useSearchParams } from 'react-router';

type RegisterPageProps = {
  homePath: string;
  loginPath: string;
};

function readRegisterFormFields(form: HTMLFormElement): RegisterFormFields {
  const formData = new FormData(form);
  const displayName = formData.get('displayName');
  const email = formData.get('email');
  const password = formData.get('password');
  const passwordConfirmation = formData.get('passwordConfirmation');

  return {
    displayName: typeof displayName === 'string' ? displayName : '',
    email: typeof email === 'string' ? email : '',
    password: typeof password === 'string' ? password : '',
    passwordConfirmation: typeof passwordConfirmation === 'string' ? passwordConfirmation : '',
  };
}

export function RegisterPage({ homePath, loginPath }: RegisterPageProps) {
  const [searchParams] = useSearchParams();
  const returnTo = parseInternalReturnTo(searchParams.get('returnTo'));
  const loginDestination = returnTo
    ? { pathname: loginPath, search: createReturnToSearch(returnTo) }
    : loginPath;
  const [formErrors, setFormErrors] = useState<RegisterFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [recoveryEmail, setRecoveryEmail] = useState<string | null>(null);

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitting || verificationEmail) {
      return;
    }

    const form = event.currentTarget;
    const fields = readRegisterFormFields(form);
    const nextFormErrors = validateRegisterForm(fields);

    setFormErrors(nextFormErrors);
    setSubmitError(null);
    setRecoveryEmail(null);

    const invalidFieldNames = Object.keys(nextFormErrors);

    if (invalidFieldNames.length > 0) {
      requestAnimationFrame(() => focusFirstInvalidField(form, invalidFieldNames));
      return;
    }

    setIsSubmitting(true);

    try {
      const { user } = await register({
        displayName: fields.displayName.trim(),
        email: fields.email.trim().toLowerCase(),
        password: fields.password,
      });

      form.reset();
      setVerificationEmail(user.email);
    } catch (error: unknown) {
      if (!(error instanceof ApiClientError) || error.status === 409 || error.status >= 500) {
        setRecoveryEmail(fields.email.trim().toLowerCase());
      }

      if (!(error instanceof ApiClientError)) {
        setSubmitError(
          'Не удалось получить ответ сервера. Проверьте соединение. ' +
            'Если письмо уже пришло, воспользуйтесь ссылкой в нём.',
        );
      } else {
        switch (error.status) {
          case 400:
            setSubmitError('Проверьте правильность заполнения полей.');
            break;
          case 409:
            setSubmitError('Этот email уже занят. Войдите или запросите подтверждение почты.');
            break;
          case 429:
            setSubmitError('Слишком много попыток. Подождите минуту и попробуйте снова.');
            break;
          case 503:
            setSubmitError(
              'Не удалось отправить письмо. Аккаунт уже мог быть создан. ' +
                'Потребуется повторная отправка подтверждения.',
            );
            break;
          default:
            setSubmitError('Не удалось зарегистрироваться. Попробуйте позже.');
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFieldChange = (
    fieldName: keyof RegisterFormFields,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    setSubmitError(null);
    setRecoveryEmail(null);

    const form = event.currentTarget.form;

    if (!form) {
      return;
    }

    const nextValidationErrors = validateRegisterForm(readRegisterFormFields(form));
    const affectedFieldNames: (keyof RegisterFormFields)[] =
      fieldName === 'password' ? ['password', 'passwordConfirmation'] : [fieldName];

    setFormErrors((currentFormErrors) => {
      const hasAffectedError = affectedFieldNames.some(
        (affectedFieldName) => currentFormErrors[affectedFieldName],
      );

      if (!hasAffectedError) {
        return currentFormErrors;
      }

      const nextFormErrors = { ...currentFormErrors };

      for (const affectedFieldName of affectedFieldNames) {
        const nextFieldError = nextValidationErrors[affectedFieldName];

        if (nextFieldError) {
          nextFormErrors[affectedFieldName] = nextFieldError;
        } else {
          delete nextFormErrors[affectedFieldName];
        }
      }

      return nextFormErrors;
    });
  };

  return (
    <AuthFormLayout
      homePath={homePath}
      title="Регистрация"
      description="Создайте аккаунт yaneMedia."
      compactMobile
      footer={
        <p>
          Уже есть аккаунт?{' '}
          <Link
            to={loginDestination}
            className={[
              'font-semibold text-text-primary underline',
              'decoration-border underline-offset-4',
              'transition-colors duration-200 hover:text-watermark',
            ].join(' ')}
          >
            Войти
          </Link>
        </p>
      }
    >
      {verificationEmail ? (
        <div className="flex flex-col gap-3">
          <p className="text-text-primary">Подтверждение почты</p>

          <p className="text-text-secondary">
            {submitError
              ? `Вы можете запросить письмо для ${verificationEmail}.`
              : `Отправили письмо на ${verificationEmail}. Перейдите по ссылке, чтобы подтвердить email.`}
          </p>

          {submitError && (
            <p role="alert" className="text-caption text-error">
              {submitError}
            </p>
          )}

          <ResendVerification key={verificationEmail} email={verificationEmail} />

          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setVerificationEmail(null);
              setRecoveryEmail(null);
              setSubmitError(null);
              setFormErrors({});
            }}
          >
            Вернуться к регистрации
          </Button>
        </div>
      ) : (
        <form className="flex flex-col gap-2" noValidate onSubmit={handleSubmit}>
          <Input
            label="Отображаемое имя"
            name="displayName"
            type="text"
            autoComplete="name"
            placeholder="Как к вам обращаться"
            error={formErrors.displayName}
            hint={`От ${DISPLAY_NAME_MIN_LENGTH} до ${DISPLAY_NAME_MAX_LENGTH} символов`}
            reserveMessageSpace
            required
            onChange={(event) => handleFieldChange('displayName', event)}
            disabled={isSubmitting}
          />

          <Input
            label="Email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="name@example.com"
            error={formErrors.email}
            required
            onChange={(event) => handleFieldChange('email', event)}
            disabled={isSubmitting}
          />

          <Input
            label="Пароль"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="Придумайте пароль"
            error={formErrors.password}
            hint={`От ${PASSWORD_MIN_LENGTH} до ${PASSWORD_MAX_LENGTH} символов`}
            reserveMessageSpace
            required
            onChange={(event) => handleFieldChange('password', event)}
            disabled={isSubmitting}
          />

          <Input
            label="Повторите пароль"
            name="passwordConfirmation"
            type="password"
            autoComplete="new-password"
            placeholder="Введите пароль ещё раз"
            error={formErrors.passwordConfirmation}
            required
            onChange={(event) => handleFieldChange('passwordConfirmation', event)}
            disabled={isSubmitting}
          />

          <Button type="submit" size="large" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? 'Отправляем письмо…' : 'Зарегистрироваться'}
          </Button>

          {submitError && (
            <p role="alert" className="text-caption text-error">
              {submitError}
            </p>
          )}

          {recoveryEmail && (
            <Button
              type="button"
              variant="secondary"
              disabled={isSubmitting}
              onClick={() => setVerificationEmail(recoveryEmail)}
            >
              Запросить подтверждение почты
            </Button>
          )}
        </form>
      )}
    </AuthFormLayout>
  );
}
