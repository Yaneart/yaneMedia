import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router';

import { routePaths } from '@/app/router/routes';
import { createSocialLoginSearch, type SocialActionIntent } from '../model/socialAccess';

type SocialLoginLinkProps = {
  intent: SocialActionIntent;
  children: ReactNode;
  className?: string;
  returnTo?: string;
  ariaLabel?: string;
};

export function SocialLoginLink({
  intent,
  children,
  className,
  returnTo,
  ariaLabel,
}: SocialLoginLinkProps) {
  const location = useLocation();
  const destination = returnTo ?? `${location.pathname}${location.search}${location.hash}`;

  return (
    <Link
      to={{ pathname: routePaths.login, search: createSocialLoginSearch(destination, intent) }}
      aria-label={ariaLabel}
      className={className}
    >
      {children}
    </Link>
  );
}
