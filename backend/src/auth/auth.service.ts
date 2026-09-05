import { UsersService } from './../users/users.service';
import { ConflictException, Injectable } from '@nestjs/common';
import { RegisterDto } from './dto/register.dto';
import { AuthUserDto } from './dto/auth-user.dto';
import { hashPassword } from './password';
import { DrizzleQueryError } from 'drizzle-orm';
import { DatabaseError } from 'pg';

@Injectable()
export class AuthService {
  constructor(private readonly usersService: UsersService) {}

  async register(dto: RegisterDto): Promise<{ user: AuthUserDto }> {
    const existingUser = await this.usersService.findByEmail(dto.email);

    if (existingUser) {
      throw new ConflictException('Этот email уже занят');
    }

    const passwordHash = await hashPassword(dto.password);

    try {
      const user = await this.usersService.create({
        displayName: dto.displayName,
        email: dto.email,
        passwordHash,
      });

      return {
        user: {
          id: user.id,
          displayName: user.displayName,
          email: user.email,
          createdAt: user.createdAt.toISOString(),
        },
      };
    } catch (error: unknown) {
      const cause = error instanceof DrizzleQueryError ? error.cause : error;

      if (
        cause instanceof DatabaseError &&
        cause.code === '23505' &&
        cause.constraint === 'users_email_unique'
      ) {
        throw new ConflictException('Этот email уже занят');
      }
      throw error;
    }
  }
}
