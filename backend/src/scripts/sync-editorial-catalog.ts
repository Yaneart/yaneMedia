import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { EditorialCatalogSyncService } from '../media/catalog/editorial-catalog-sync.service';
import { MediaModule } from '../media/media.module';

@Module({ imports: [MediaModule] })
class EditorialCatalogSyncModule {}

const phaseLabels = {
  metadata: 'metadata',
  assets: 'artwork',
  publish: 'database',
} as const;

async function main(): Promise<void> {
  const unknownArguments = process.argv.slice(2).filter((argument) => argument !== '--dry-run');
  if (unknownArguments.length > 0) {
    throw new Error(`Unknown arguments: ${unknownArguments.join(', ')}`);
  }

  process.env.YANEMEDIA_QUIET_DIAGNOSTICS = '1';
  const startedAt = Date.now();
  process.stdout.write('Catalog sync started.\n');

  const application = await NestFactory.createApplicationContext(EditorialCatalogSyncModule, {
    logger: ['error', 'warn'],
  });

  try {
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
