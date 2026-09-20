import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { EditorialCatalogSyncService } from '../media/catalog/editorial-catalog-sync.service';
import { MediaModule } from '../media/media.module';

@Module({ imports: [MediaModule] })
class EditorialCatalogSyncModule {}

async function main(): Promise<void> {
  const application = await NestFactory.createApplicationContext(EditorialCatalogSyncModule, {
    logger: ['error', 'warn'],
  });

  try {
    const report = await application.get(EditorialCatalogSyncService).sync();
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await application.close();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Editorial catalog sync failed';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
