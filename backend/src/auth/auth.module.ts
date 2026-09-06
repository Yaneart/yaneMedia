import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { UsersModule } from '../users/users.module';
import { DatabaseModule } from '../database/database.module';
import { AuthRepository } from './auth.repository';
import { AppConfigModule } from '../config/config.module';
import { SessionGuard } from './guards/session.guard';

@Module({
  imports: [UsersModule, DatabaseModule, AppConfigModule],
  controllers: [AuthController],
  providers: [AuthService, AuthRepository, SessionGuard],
})
export class AuthModule {}
