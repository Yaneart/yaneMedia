import { ConsoleLogger, Injectable } from '@nestjs/common';
import type { ProviderDiagnostic } from '../../media/media-provider-diagnostics';

export interface DiscoveryHttpPerformanceEvent {
  event: 'discovery.http';
  method: 'GET';
  path: string;
  source: 'media_engine' | 'editorial_catalog';
  status: number;
  durationMs: number;
  responseBytes: number;
  cards: number;
  collections: number;
}

export type DiscoveryCatalogReadPerformanceEvent =
  | {
      event: 'discovery.catalog_read';
      storage: 'editorial_manifest_memory';
      durationMs: number;
      requestedItems: number;
      returnedItems: number;
      freshCacheItems: number;
      refreshedItems: number;
      staleItems: number;
      missingItems: number;
    }
  | {
      event: 'discovery.catalog_read';
      storage: 'postgres_editorial_catalog';
      durationMs: number;
      returnedItems: number;
    };

export interface DiscoveryMediaEnginePerformanceEvent {
  event: 'discovery.media_engine_refresh';
  operation: 'search' | 'details' | 'availability' | 'related';
  result: 'success' | 'error';
  queueWaitMs: number;
  durationMs: number;
  cacheOutcome: 'hit' | 'miss' | 'stale' | 'unknown';
  providersRequested: number;
  providersSuccessful: number;
  providersFailed: number;
  warnings: number;
}

export type PerformanceEvent =
  | DiscoveryHttpPerformanceEvent
  | DiscoveryCatalogReadPerformanceEvent
  | DiscoveryMediaEnginePerformanceEvent;

export type ProviderDiagnosticEvent = ProviderDiagnostic & { event: 'media.provider_diagnostic' };

@Injectable()
export class AppLogger {
  private readonly logger = new ConsoleLogger({ json: true });

  logPerformance(event: PerformanceEvent): void {
    this.logger.log(event);
  }

  logProviderDiagnostic(event: ProviderDiagnosticEvent): void {
    this.logger.log(event);
  }

  logUnexpectedError(context: string): void {
    this.logger.error('Unexpected application error', context);
  }
}
