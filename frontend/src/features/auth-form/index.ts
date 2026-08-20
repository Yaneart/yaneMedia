export {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_MIN_LENGTH,
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  validateLoginForm,
  validateRegisterForm,
} from './model/authFormValidation';
export type {
  LoginFormErrors,
  LoginFormFields,
  RegisterFormErrors,
  RegisterFormFields,
} from './model/authFormValidation';

export { focusFirstInvalidField } from './lib/focusFirstInvalidField';
