import { Button, Input } from '@/shared';
import { AuthDemoNotice, AuthFormLayout } from '@/widgets/auth-form-layout';
import { useState, type SubmitEvent } from 'react';
import { Link } from 'react-router';

type LoginPageProps = {
  homePath: string;
  registerPath: string;
};

export function LoginPage({ homePath, registerPath }: LoginPageProps) {
  const [isDemoNoticeVisible, setIsDemoNoticeVisible] = useState(false);

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsDemoNoticeVisible(true);
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
      <form className="flex flex-col gap-5" onSubmit={handleSubmit}>
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
          autoComplete="current-password"
          placeholder="Введите пароль"
          required
        />

        <Button type="submit" size="large" className="mt-2 w-full">
          Войти
        </Button>

        {isDemoNoticeVisible && <AuthDemoNotice />}
      </form>
    </AuthFormLayout>
  );
}
