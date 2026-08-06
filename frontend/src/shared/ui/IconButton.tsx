import type { ReactNode } from 'react';
import { Button, type ButtonProps } from './Button';

export type IconButtonProps = Omit<ButtonProps, 'aria-label' | 'children' | 'iconOnly'> & {
  'aria-label': string;
  children: ReactNode;
};

export function IconButton({ children, ...props }: IconButtonProps) {
  return (
    <Button {...props} iconOnly>
      {children}
    </Button>
  );
}
