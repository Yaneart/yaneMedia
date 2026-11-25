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
import { createSocialLoginSearch, parseSocialActionIntent } from '@/features/social-access';
import { Button, Input, parseInternalReturnTo } from '@/shared';
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
  const socialIntent = returnTo ? parseSocialActionIntent(searchParams.get('intent')) : null;
  const loginDestination = returnTo
    ? {
        pathname: loginPath,
        search: createSocialLoginSearch(returnTo, socialIntent),
      }
    : loginPath;
  const [formErrors, setFormErrors] = useState<RegisterFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [verification, setVerification] = useState<{
    email: string;
    message: string;
    sent: boolean;
  } | null>(null);

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitting || verification) {
      return;
    }

    const form = event.currentTarget;
    const fields = readRegisterFormFields(form);
    const nextFormErrors = validateRegisterForm(fields);

    setFormErrors(nextFormErrors);
    setSubmitError(null);

    const invalidFieldNames = Object.keys(nextFormErrors);

    if (invalidFieldNames.length > 0) {
      requestAnimationFrame(() => focusFirstInvalidField(form, invalidFieldNames));
      return;
    }

    const email = fields.email.trim().toLowerCase();
    setIsSubmitting(true);

    try {
      const { user } = await register({
        displayName: fields.displayName.trim(),
        email,
        password: fields.password,
      });

      form.reset();
      setVerification({
        email: user.email,
        message: `Отправили письмо на ${user.email}. Перейдите по ссылке, чтобы подтвердить почту.`,
        sent: true,
      });
    } catch (error: unknown) {
      if (!(error instanceof ApiClientError) || error.status >= 500) {
        if (error instanceof ApiClientError && error.code === 'MAIL_NOT_CONFIGURED') {
          setSubmitError(error.message);
        } else {
          setVerification({
            email,
            message: `Не удалось подтвердить отправку письма на ${email}. Если письмо не пришло, запросите его ещё раз.`,
            sent: false,
          });
        }
        return;
      }

      if (error.code === 'EMAIL_VERIFICATION_REQUIRED') {
        setVerification({
          email,
          message: `Адрес ${email} ещё не подтверждён. Если письмо не пришло, запросите его ещё раз.`,
          sent: false,
        });
        return;
      }

      switch (error.status) {
        case 400:
          setSubmitError('Проверьте правильность заполнения полей.');
          break;
        case 409:
          setSubmitError('Для этого адреса уже есть аккаунт. Войдите или восстановите пароль.');
          break;
        case 429:
          setSubmitError('Слишком много попыток. Подождите минуту и попробуйте снова.');
          break;
        default:
          setSubmitError('Не удалось зарегистрироваться. Попробуйте позже.');
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
      {verification ? (
        <div className="flex flex-col gap-3">
          <p className="text-text-primary">Подтверждение почты</p>

          <p role="status" className="wrap-break-word text-text-secondary">
            {verification.message}
          </p>

          <ResendVerification email={verification.email} startWithCooldown={verification.sent} />

          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setVerification(null);
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
        </form>
      )}
    </AuthFormLayout>
  );
}
