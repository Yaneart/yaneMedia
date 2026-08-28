import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  focusFirstInvalidField,
  validateRegisterForm,
  type RegisterFormErrors,
  type RegisterFormFields,
} from '@/features/auth-form';
import { Button, Input } from '@/shared';
import { AuthDemoNotice, AuthFormLayout } from '@/widgets/auth-form-layout';
import { useState, type ChangeEvent, type SubmitEvent } from 'react';
import { Link } from 'react-router';

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
  const [formErrors, setFormErrors] = useState<RegisterFormErrors>({});
  const [isDemoNoticeVisible, setIsDemoNoticeVisible] = useState(false);

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = event.currentTarget;
    const nextFormErrors = validateRegisterForm(readRegisterFormFields(form));

    setFormErrors(nextFormErrors);
    setIsDemoNoticeVisible(false);

    const invalidFieldNames = Object.keys(nextFormErrors);

    if (invalidFieldNames.length > 0) {
      requestAnimationFrame(() => focusFirstInvalidField(form, invalidFieldNames));
      return;
    }

    setIsDemoNoticeVisible(true);
  };

  const handleFieldChange = (
    fieldName: keyof RegisterFormFields,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    setIsDemoNoticeVisible(false);

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
            to={loginPath}
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
        />

        <Button type="submit" size="large" className="w-full">
          Зарегистрироваться
        </Button>

        {isDemoNoticeVisible && <AuthDemoNotice />}
      </form>
    </AuthFormLayout>
  );
}
