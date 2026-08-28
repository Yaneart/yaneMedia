import type { ComponentPropsWithRef } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'bare';

export type ButtonSize = 'small' | 'medium' | 'large' | 'custom';

export type ButtonProps = ComponentPropsWithRef<'button'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
};

const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-action text-action-text hover:opacity-90',
  secondary:
    'border border-border bg-control text-text-primary hover:border-text-secondary hover:bg-control-hover',
  ghost: 'bg-transparent text-text-secondary hover:bg-interactive-hover hover:text-text-primary',
  bare: '',
};

const sizeClasses: Record<ButtonSize, string> = {
  small: 'min-h-9 px-3 text-sm',
  medium: 'min-h-11 px-4 text-sm',
  large: 'min-h-12 px-5 text-base',
  custom: '',
};

const iconOnlySizeClasses: Record<ButtonSize, string> = {
  small: 'size-9',
  medium: 'size-11',
  large: 'size-12',
  custom: '',
};

export function Button({
  variant = 'primary',
  size = 'medium',
  type = 'button',
  iconOnly = false,
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
        'transition-[background-color,border-color,color,opacity,transform,box-shadow]',
        'duration-200 ease-out active:scale-[0.985] active:duration-75',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action/20',
        'motion-reduce:transform-none motion-reduce:transition-none',
        'disabled:pointer-events-none disabled:opacity-50',
        variantClasses[variant],
        iconOnly ? iconOnlySizeClasses[size] : sizeClasses[size],
        className,
      ].join(' ')}
      {...props}
    />
  );
}
