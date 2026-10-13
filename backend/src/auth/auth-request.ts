import type { Request } from 'express';
import type { AuthUserDto } from './dto/auth-user.dto';
import type { User } from '../users/entities/user.entity';

export type AuthenticatedUser = AuthUserDto & Pick<User, 'id' | 'role'>;

export type AuthRequest = Omit<Request, 'cookies'> & {
  cookies?: Record<string, unknown>;
  user?: AuthenticatedUser;
};
