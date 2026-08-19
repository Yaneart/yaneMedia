import { Button, Input } from '@/shared';
import { AuthFormLayout } from '@/widgets/auth-form-layout';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';

type RegisterPageProps = {
  homePath: string;
  loginPath: string;
};

export function RegisterPage({ homePath, loginPath }: RegisterPageProps) {
  const [passwordConfirmationError, setPasswordConfirmationError] = useState<string>();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const formData = new FormData(event.currentTarget);
    const password = formData.get('password');
    const passwordConfirmation = formData.get('passwordConfirmation');

    if (password !== passwordConfirmation) {
      setPasswordConfirmationError('Пароли не совпадают');
      return;
    }

    setPasswordConfirmationError(undefined);
  };

  const clearPasswordConfirmationError = () => {
    if (passwordConfirmationError) {
      setPasswordConfirmationError(undefined);
    }
  };

  return (
    <AuthFormLayout
      homePath={homePath}
      title="Регистрация"
      description="Создайте аккаунт yaneMedia."
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
      <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
        <Input
          label="Отображаемое имя"
          name="displayName"
          type="text"
          autoComplete="name"
          placeholder="Как к вам обращаться"
          required
        />

        <Input
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="name@example.com"
          required
        />

        <Input
          label="Пароль"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="Придумайте пароль"
          required
          onChange={clearPasswordConfirmationError}
        />

        <Input
          label="Повторите пароль"
          name="passwordConfirmation"
          type="password"
          autoComplete="new-password"
          placeholder="Введите пароль ещё раз"
          error={passwordConfirmationError}
          required
          onChange={clearPasswordConfirmationError}
        />

        <Button type="submit" size="large" className="mt-2 w-full">
          Зарегистрироваться
        </Button>
      </form>
    </AuthFormLayout>
  );
}
