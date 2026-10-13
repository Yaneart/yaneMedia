import { createParamDecorator, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { AuthRequest } from '../auth-request';
import type { AuthenticatedUser } from '../auth-request';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const { user } = context.switchToHttp().getRequest<AuthRequest>();

    if (!user) {
      throw new UnauthorizedException('Необходим вход в аккаунт');
    }

    return user;
  },
);

export const OptionalCurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser | undefined =>
    context.switchToHttp().getRequest<AuthRequest>().user,
);
