import type { ComponentPropsWithRef } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export type ButtonSize = 'small' | 'medium' | 'large';

export type ButtonProps = ComponentPropsWithRef<'button'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-action text-action-text hover:opacity-90',
  secondary: 'border border-border bg-surface text-text-primary hover:bg-interactive-hover',
  ghost: 'bg-transparent text-text-secondary hover:bg-interactive-hover hover:text-text-primary',
};

const sizeClasses: Record<ButtonSize, string> = {
  small: 'min-h-9 px-3 text-sm',
  medium: 'min-h-11 px-4 text-sm',
  large: 'min-h-12 px-5 text-base',
};

export function Button({
  variant = 'primary',
  size = 'medium',
  type = 'button',
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-control font-semibold',
        'transition-colors duration-150',
        'disabled:pointer-events-none disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(' ')}
      {...props}
    />
  );
}
