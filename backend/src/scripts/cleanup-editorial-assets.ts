import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MediaAssetCleanupService } from '../media/assets/media-asset-cleanup.service';
import { MediaModule } from '../media/media.module';

@Module({ imports: [MediaModule] })
class EditorialAssetCleanupModule {}

async function main(): Promise<void> {
  const unknownArguments = process.argv.slice(2).filter((argument) => argument !== '--delete');
  if (unknownArguments.length > 0) {
    throw new Error(`Unknown arguments: ${unknownArguments.join(', ')}`);
  }

  const application = await NestFactory.createApplicationContext(EditorialAssetCleanupModule, {
    logger: ['error', 'warn'],
  });

  try {
    const report = await application
      .get(MediaAssetCleanupService)
      .cleanup({ apply: process.argv.includes('--delete') });
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await application.close();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Editorial asset cleanup failed';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
