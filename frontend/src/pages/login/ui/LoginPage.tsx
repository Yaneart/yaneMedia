import {
  focusFirstInvalidField,
  validateLoginForm,
  type LoginFormErrors,
  type LoginFormFields,
} from '@/features/auth-form';
import { Button, Input } from '@/shared';
import { AuthDemoNotice, AuthFormLayout } from '@/widgets/auth-form-layout';
import { useState, type ChangeEvent, type SubmitEvent } from 'react';
import { Link } from 'react-router';

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
  const [isDemoNoticeVisible, setIsDemoNoticeVisible] = useState(false);

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();

    const form = event.currentTarget;
    const nextFormErrors = validateLoginForm(readLoginFormFields(form));

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
    fieldName: keyof LoginFormFields,
    event: ChangeEvent<HTMLInputElement>,
  ) => {
    setIsDemoNoticeVisible(false);

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
        />

        <Button type="submit" size="large" className="w-full">
          Войти
        </Button>

        {isDemoNoticeVisible && <AuthDemoNotice />}
      </form>
    </AuthFormLayout>
  );
}
