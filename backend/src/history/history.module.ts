import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { HistoryController } from './history.controller';
import { HistoryRepository } from './history.repository';
import { HistoryService } from './history.service';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [HistoryController],
  providers: [HistoryRepository, HistoryService],
})
export class HistoryModule {}
