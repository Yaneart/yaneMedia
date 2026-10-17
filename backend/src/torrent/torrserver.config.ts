import { readFileSync } from 'node:fs';
import { ConfigService } from '@nestjs/config';

export const TORRSERVER_CONFIG = Symbol('TORRSERVER_CONFIG');

export interface TorrServerConfig {
  enabled: boolean;
  baseUrl?: URL;
  authorization?: string;
  connectTimeoutMs: number;
  headersTimeoutMs: number;
  bodyTimeoutMs: number;
  metadataTimeoutMs: number;
  maxJsonBytes: number;
  maxUploadBytes: number;
}

const readSecret = (path: string, name: string, allowColon = true): string => {
  const value = readFileSync(path, 'utf8').replace(/[\r\n]+$/, '');
  if (
    !value ||
    value.length > 512 ||
    value.includes('\0') ||
    (!allowColon && value.includes(':'))
  ) {
    throw new Error(`${name} secret file is invalid`);
  }
  return value;
};

export function createTorrServerConfig(config: ConfigService): TorrServerConfig {
  const enabled = config.get<boolean>('TORRENT_STREAMING_ENABLED', false);
  const shared = {
    enabled,
    connectTimeoutMs: config.get<number>('TORRSERVER_CONNECT_TIMEOUT_MS', 3_000),
    headersTimeoutMs: config.get<number>('TORRSERVER_HEADERS_TIMEOUT_MS', 30_000),
    bodyTimeoutMs: config.get<number>('TORRSERVER_BODY_TIMEOUT_MS', 30_000),
    metadataTimeoutMs: config.get<number>('TORRSERVER_METADATA_TIMEOUT_MS', 120_000),
    maxJsonBytes: 1024 * 1024,
    maxUploadBytes: 2 * 1024 * 1024,
  };
  if (!enabled) return shared;

  const baseUrl = new URL(config.getOrThrow<string>('TORRSERVER_BASE_URL'));
  const username = readSecret(
    config.getOrThrow<string>('TORRSERVER_USERNAME_FILE'),
    'TorrServer username',
    false,
  );
  const password = readSecret(
    config.getOrThrow<string>('TORRSERVER_PASSWORD_FILE'),
    'TorrServer password',
  );

  return {
    ...shared,
    baseUrl,
    authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`,
  };
}
