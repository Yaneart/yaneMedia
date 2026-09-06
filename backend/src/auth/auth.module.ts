import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { DatabaseModule } from '../database/database.module';
import { AuthRepository } from './auth.repository';
import { AppConfigModule } from '../config/config.module';
import { SessionGuard } from './guards/session.guard';
import { CsrfGuard } from './guards/csrf.guard';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 10 }],
      errorMessage: 'Слишком много запросов. Попробуйте позже.',
    }),
    UsersModule,
    DatabaseModule,
    AppConfigModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthRepository, SessionGuard, CsrfGuard, ThrottlerGuard],
})
export class AuthModule {}
