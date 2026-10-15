import { ApiClientError } from '../../../shared/api';
import { parseInternalReturnTo } from '../../../shared/lib/internalReturnTo';

export const socialActionIntents = ['rating', 'review', 'comment', 'report', 'profile'] as const;

export type SocialActionIntent = (typeof socialActionIntents)[number];
export type SocialAccessErrorKind =
  'authentication' | 'verification' | 'forbidden' | 'rate-limit' | 'temporary' | 'other';

export type SocialAccessError = {
  kind: SocialAccessErrorKind;
  message: string;
};

export function parseSocialActionIntent(value: unknown): SocialActionIntent | null {
  return typeof value === 'string' && socialActionIntents.includes(value as SocialActionIntent)
    ? (value as SocialActionIntent)
    : null;
}

export function createSocialLoginSearch(
  returnTo: string,
  intent: SocialActionIntent | null = null,
): string {
  const safeReturnTo = parseInternalReturnTo(returnTo) ?? '/';
  const params = new URLSearchParams({ returnTo: safeReturnTo });
  if (intent) params.set('intent', intent);
  return `?${params.toString()}`;
}

const loginDescriptions: Record<SocialActionIntent, string> = {
  rating: 'Войдите, чтобы поставить оценку.',
  review: 'Войдите, чтобы написать рецензию.',
  comment: 'Войдите, чтобы участвовать в обсуждении.',
  report: 'Войдите, чтобы отправить жалобу.',
  profile: 'Войдите, чтобы открыть личный профиль.',
};

export function getSocialLoginDescription(intent: SocialActionIntent | null): string {
  return intent ? loginDescriptions[intent] : 'Войдите в свой аккаунт yaneMedia.';
}

export function createSocialIntentState(intent: SocialActionIntent) {
  return { socialActionIntent: intent } as const;
}

export function readSocialIntentState(value: unknown): SocialActionIntent | null {
  if (typeof value !== 'object' || value === null || !('socialActionIntent' in value)) return null;
  return parseSocialActionIntent(value.socialActionIntent);
}

function retryDelay(error: ApiClientError): string {
  if (error.retryAfterMs === null) return 'немного';
  const seconds = Math.max(1, Math.ceil(error.retryAfterMs / 1000));
  return seconds < 60 ? `${seconds} сек.` : `${Math.ceil(seconds / 60)} мин.`;
}

export function describeSocialAccessError(
  error: unknown,
  fallback = 'Не удалось выполнить действие. Попробуйте снова.',
): SocialAccessError {
  if (!(error instanceof ApiClientError)) {
    return {
      kind: 'temporary',
      message: 'Не удалось получить ответ сервера. Проверьте соединение и попробуйте снова.',
    };
  }

  if (error.status === 401 || error.code === 'AUTH_REQUIRED') {
    return { kind: 'authentication', message: 'Сессия завершилась. Войдите снова.' };
  }
  if (error.code === 'EMAIL_VERIFICATION_REQUIRED' || error.code === 'EMAIL_NOT_VERIFIED') {
    return { kind: 'verification', message: 'Подтвердите email, чтобы выполнить это действие.' };
  }
  if (error.status === 403 || error.code === 'ACTION_FORBIDDEN') {
    return { kind: 'forbidden', message: 'У вас нет права на это действие.' };
  }
  if (error.status === 429 || error.code === 'RATE_LIMITED') {
    return {
      kind: 'rate-limit',
      message: `Слишком много действий. Повторите через ${retryDelay(error)}`,
    };
  }
  if (error.status >= 500 || error.code === 'UPSTREAM_UNAVAILABLE') {
    return { kind: 'temporary', message: 'Сервис временно недоступен. Попробуйте позже.' };
  }

  return { kind: 'other', message: fallback };
}
