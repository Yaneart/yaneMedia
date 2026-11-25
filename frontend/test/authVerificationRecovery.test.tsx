import { afterAll, afterEach, expect, mock, test } from 'bun:test';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

GlobalRegistrator.register({ url: 'http://localhost:5173' });
const { cleanup, fireEvent, render, screen } = await import('@testing-library/react');
const { MemoryRouter } = await import('react-router');
const { AuthContext } = await import('../src/entities/auth/model/authContext');
const { ThemeProvider } = await import('../src/features/theme');
const { LoginPage } = await import('../src/pages/login/ui/LoginPage');
const { RegisterPage } = await import('../src/pages/register/ui/RegisterPage');
const { VerifyEmailPage } = await import('../src/pages/verify-email/ui/VerifyEmailPage');
const originalFetch = globalThis.fetch;
const email = 'artem@example.test';

afterEach(() => {
  cleanup();
  globalThis.fetch = originalFetch;
});
afterAll(() => GlobalRegistrator.unregister());

function submitRegistration() {
  render(
    <MemoryRouter>
      <ThemeProvider>
        <RegisterPage homePath="/" loginPath="/login" />
      </ThemeProvider>
    </MemoryRouter>,
  );

  fireEvent.change(screen.getByLabelText('Отображаемое имя'), { target: { value: 'Артём' } });
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'Example123' } });
  fireEvent.change(screen.getByLabelText('Повторите пароль'), { target: { value: 'Example123' } });
  fireEvent.submit(screen.getByRole<HTMLButtonElement>('button', { name: 'Зарегистрироваться' }).form!);
}

test.each([
  [503, 'UPSTREAM_UNAVAILABLE', 'Не удалось подтвердить отправку'],
  [409, 'EMAIL_VERIFICATION_REQUIRED', 'ещё не подтверждён'],
] as const)('offers immediate resend after registration responds with %i %s', async (status, code, message) => {
  const requests = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/auth/register')) {
      return Response.json({ error: { code } }, { status });
    }

    expect(String(input)).toEndWith('/auth/resend-verification');
    expect(JSON.parse(String(init?.body))).toEqual({ email });
    return Response.json({ data: { success: true } });
  });
  globalThis.fetch = requests as typeof fetch;
  submitRegistration();

  const resend = await screen.findByRole<HTMLButtonElement>('button', {
    name: 'Отправить письмо ещё раз',
  });
  expect(screen.getByRole('status').textContent).toContain(message);
  expect(resend.disabled).toBe(false);
  fireEvent.click(resend);

  await screen.findByText(/письмо будет отправлено/);
  expect(requests).toHaveBeenCalledTimes(2);
  expect(screen.getByRole<HTMLButtonElement>('button', { name: /Повторить через/ }).disabled).toBe(true);
});

test('offers login for a confirmed email', async () => {
  globalThis.fetch = mock(async () =>
    Response.json({ error: { code: 'RESOURCE_CONFLICT' } }, { status: 409 }),
  ) as typeof fetch;
  submitRegistration();

  expect((await screen.findByRole('alert')).textContent).toContain('Войдите или восстановите пароль');
  expect(screen.getByRole('link', { name: 'Войти' }).getAttribute('href')).toBe('/login');
  expect(screen.queryByRole('button', { name: 'Отправить письмо ещё раз' })).toBeNull();
});

test('starts the cooldown when registration has already sent a confirmation', async () => {
  globalThis.fetch = mock(async () =>
    Response.json({ data: { user: { email } } }, { status: 201 }),
  ) as typeof fetch;
  submitRegistration();

  const resend = await screen.findByRole<HTMLButtonElement>('button', { name: /Повторить через/ });
  expect(resend.disabled).toBe(true);
});

test('offers immediate resend after login for an unconfirmed account', async () => {
  const requests = mock(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).endsWith('/auth/login')) {
      return Response.json({ error: { code: 'ACTION_FORBIDDEN' } }, { status: 403 });
    }

    expect(String(input)).toEndWith('/auth/resend-verification');
    expect(JSON.parse(String(init?.body))).toEqual({ email });
    return Response.json({ data: { success: true } });
  });
  globalThis.fetch = requests as typeof fetch;
  const setAuthenticated = mock();

  render(
    <MemoryRouter>
      <ThemeProvider>
        <AuthContext.Provider
          value={{
            state: { status: 'guest', user: null },
            setAuthenticated,
            setGuest: mock(),
            refresh: async () => {},
          }}
        >
          <LoginPage homePath="/" registerPath="/register" forgotPasswordPath="/forgot-password" />
        </AuthContext.Provider>
      </ThemeProvider>
    </MemoryRouter>,
  );

  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: 'Example123' } });
  fireEvent.submit(screen.getByRole<HTMLButtonElement>('button', { name: 'Войти' }).form!);

  const resend = await screen.findByRole<HTMLButtonElement>('button', {
    name: 'Отправить письмо ещё раз',
  });
  expect(resend.disabled).toBe(false);
  expect(requests).toHaveBeenCalledTimes(1);
  expect(setAuthenticated).not.toHaveBeenCalled();
  fireEvent.click(resend);

  await screen.findByText(/письмо будет отправлено/);
  expect(requests).toHaveBeenCalledTimes(2);
  expect(screen.getByRole<HTMLButtonElement>('button', { name: /Повторить через/ }).disabled).toBe(true);
});

test('offers immediate resend from a verification link without a token', () => {
  render(
    <MemoryRouter>
      <ThemeProvider>
        <VerifyEmailPage homePath="/" loginPath="/login" />
      </ThemeProvider>
    </MemoryRouter>,
  );

  fireEvent.change(screen.getByLabelText('Email аккаунта'), { target: { value: email } });
  fireEvent.submit(
    screen.getByRole<HTMLButtonElement>('button', { name: 'Запросить новую ссылку' }).form!,
  );
  expect(
    screen.getByRole<HTMLButtonElement>('button', { name: 'Отправить письмо ещё раз' }).disabled,
  ).toBe(false);
});
