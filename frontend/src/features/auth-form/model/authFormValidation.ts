export const EMAIL_MAX_LENGTH = 254;
export const DISPLAY_NAME_MIN_LENGTH = 2;
export const DISPLAY_NAME_MAX_LENGTH = 50;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LoginFormFields = {
  email: string;
  password: string;
};

export type RegisterFormFields = {
  displayName: string;
  email: string;
  password: string;
  passwordConfirmation: string;
};

export type LoginFormErrors = Partial<Record<keyof LoginFormFields, string>>;
export type RegisterFormErrors = Partial<Record<keyof RegisterFormFields, string>>;

function validateEmail(value: string): string | undefined {
  const email = value.trim();

  if (!email) {
    return 'Введите email';
  }

  if (email.length > EMAIL_MAX_LENGTH) {
    return `Email не должен быть длиннее ${EMAIL_MAX_LENGTH} символов`;
  }

  if (!EMAIL_PATTERN.test(email)) {
    return 'Введите корректный email';
  }

  return undefined;
}

export function validateLoginForm(fields: LoginFormFields): LoginFormErrors {
  const errors: LoginFormErrors = {};
  const emailError = validateEmail(fields.email);

  if (emailError) {
    errors.email = emailError;
  }

  if (fields.password.length === 0) {
    errors.password = 'Введите пароль';
  }

  return errors;
}

function getCharacterCount(value: string): number {
  return [...value].length;
}

export function validateRegisterForm(fields: RegisterFormFields): RegisterFormErrors {
  const errors: RegisterFormErrors = {};
  const displayName = fields.displayName.trim();
  const displayNameLength = getCharacterCount(displayName);
  const emailError = validateEmail(fields.email);
  const passwordLength = getCharacterCount(fields.password);

  if (!displayName) {
    errors.displayName = 'Введите отображаемое имя';
  } else if (displayNameLength < DISPLAY_NAME_MIN_LENGTH) {
    errors.displayName = `Имя должно содержать минимум ${DISPLAY_NAME_MIN_LENGTH} символа`;
  } else if (displayNameLength > DISPLAY_NAME_MAX_LENGTH) {
    errors.displayName = `Имя не должно быть длиннее ${DISPLAY_NAME_MAX_LENGTH} символов`;
  }

  if (emailError) {
    errors.email = emailError;
  }

  if (passwordLength === 0) {
    errors.password = 'Придумайте пароль';
  } else if (passwordLength < PASSWORD_MIN_LENGTH) {
    errors.password = `Пароль должен содержать минимум ${PASSWORD_MIN_LENGTH} символов`;
  } else if (passwordLength > PASSWORD_MAX_LENGTH) {
    errors.password = `Пароль не должен быть длиннее ${PASSWORD_MAX_LENGTH} символов`;
  }

  if (fields.passwordConfirmation.length === 0) {
    errors.passwordConfirmation = 'Повторите пароль';
  } else if (fields.password !== fields.passwordConfirmation) {
    errors.passwordConfirmation = 'Пароли не совпадают';
  }

  return errors;
}
