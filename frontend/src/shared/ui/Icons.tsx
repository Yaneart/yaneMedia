import type { ComponentPropsWithoutRef } from 'react';

export type IconProps = ComponentPropsWithoutRef<'svg'>;

export function SearchIcon({ className = '', ...props }: IconProps) {
  return (
    <svg
      {...props}
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      className={className}
    >
      <path
        d="m21 21-4.35-4.35m2.35-5.65a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CloseIcon({ className = '', ...props }: IconProps) {
  return (
    <svg
      {...props}
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      className={className}
    >
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
