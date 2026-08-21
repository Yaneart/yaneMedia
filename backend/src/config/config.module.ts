import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      cache: true,
    }),
  ],
  exports: [ConfigModule],
})
export class AppConfigModule {}
