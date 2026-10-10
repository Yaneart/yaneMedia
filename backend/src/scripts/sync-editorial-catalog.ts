import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { MediaAssetStore } from '../media/assets/media-asset-store';
import { EditorialCatalogSyncService } from '../media/catalog/editorial-catalog-sync.service';
import { EditorialCatalogRepository } from '../media/catalog/editorial-catalog.repository';
import { MediaModule } from '../media/media.module';

@Module({ imports: [MediaModule] })
class EditorialCatalogSyncModule {}

const phaseLabels = {
  metadata: 'metadata',
  assets: 'artwork',
  publish: 'database',
} as const;

async function main(): Promise<void> {
  const supportedArguments = new Set(['--dry-run', '--rebuild']);
  const unknownArguments = process.argv
    .slice(2)
    .filter((argument) => !supportedArguments.has(argument));
  if (unknownArguments.length > 0) {
    throw new Error(`Unknown arguments: ${unknownArguments.join(', ')}`);
  }
  if (process.argv.includes('--dry-run') && process.argv.includes('--rebuild')) {
    throw new Error('--dry-run and --rebuild cannot be used together');
  }

  process.env.YANEMEDIA_QUIET_DIAGNOSTICS = '1';
  const startedAt = Date.now();
  process.stdout.write('Catalog sync started.\n');

  const application = await NestFactory.createApplicationContext(EditorialCatalogSyncModule, {
    logger: ['error', 'warn'],
  });

  try {
    if (process.argv.includes('--rebuild')) {
      await application.get(EditorialCatalogRepository).resetCatalog();
      const deletedFiles = await application.get(MediaAssetStore).clear();
      process.stdout.write(`Catalog reset completed. Deleted ${deletedFiles} local assets.\n`);
    }

    const lastPrinted = new Map<string, number>();
    const report = await application.get(EditorialCatalogSyncService).sync(undefined, {
      dryRun: process.argv.includes('--dry-run'),
      onProgress: ({ phase, completed, total }) => {
        const previous = lastPrinted.get(phase);
        if (completed !== 0 && completed !== total && completed % 10 !== 0) return;
        if (previous === completed) return;
        lastPrinted.set(phase, completed);
        process.stdout.write(`[${phaseLabels[phase]}] ${completed}/${total}\n`);
      },
    });
    const elapsedSeconds = Math.round((Date.now() - startedAt) / 1_000);
    process.stdout.write(`Catalog sync completed in ${elapsedSeconds}s.\n`);
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } finally {
    await application.close();
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Editorial catalog sync failed';
  process.stderr.write(`\nCatalog sync failed: ${message}\nNo catalog revision was published.\n`);
  process.exitCode = 1;
});
