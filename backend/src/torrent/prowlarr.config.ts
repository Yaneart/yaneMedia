import { readFileSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';

export const PROWLARR_CONFIG = Symbol('PROWLARR_CONFIG');

export interface ProwlarrConfig {
  baseUrl?: URL;
  apiKey?: string;
  timeoutMs: number;
  indexerIds?: number[];
}

export function createProwlarrConfig(config: ConfigService): ProwlarrConfig {
  const origin = config.get<string>('PROWLARR_BASE_URL');
  const keyFile = config.get<string>('PROWLARR_API_KEY_FILE');
  if (Boolean(origin) !== Boolean(keyFile)) {
    throw new Error('Prowlarr origin and API key file must be configured together');
  }
  if (!origin || !keyFile) return { timeoutMs: 10_000 };

  const apiKey = readFileSync(keyFile, 'utf8').trim();
  if (!/^[a-f0-9]{32}$/i.test(apiKey)) throw new Error('Prowlarr API key file is invalid');
  return {
    baseUrl: new URL(origin),
    apiKey,
    timeoutMs: config.get<number>('PROWLARR_TIMEOUT_MS', 10_000),
    indexerIds: parseIndexerIds(config.get<string>('PROWLARR_INDEXER_IDS')),
  };
}

function parseIndexerIds(value: string | undefined): number[] {
  if (!value?.trim()) return [];
  const parts = value.split(',').map((part) => part.trim());
  if (parts.length > 8 || parts.some((part) => !/^[1-9]\d{0,5}$/.test(part)))
    throw new Error('Invalid Prowlarr indexer IDs');
  return [...new Set(parts.map(Number))];
}
