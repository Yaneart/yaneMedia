import { createParamDecorator, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { AuthRequest } from '../auth-request';
import type { AuthUserDto } from '../dto/auth-user.dto';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUserDto => {
    const { user } = context.switchToHttp().getRequest<AuthRequest>();

    if (!user) {
      throw new UnauthorizedException('Необходим вход в аккаунт');
    }

    return user;
  },
);
