import type { ExternalIds } from '@media-engine/core';
import { createHash } from 'node:crypto';
import type {
  CanonicalMediaIdentity,
  MediaRegistryService,
  RegisterMediaIdentityInput,
} from '../../src/media/registry/media-registry.service';

export function canonicalMediaRef(seed: string): string {
  const hash = createHash('sha256').update(seed).digest('hex');
  return `work_${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function identitySeed(ids: Readonly<ExternalIds>): string {
  return Object.entries(ids)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([namespace, value]) => `${namespace}:${value}`)
    .join('|');
}

function createIdentity(input: RegisterMediaIdentityInput): CanonicalMediaIdentity {
  const seed = identitySeed(input.ids as ExternalIds);
  const mediaRef = canonicalMediaRef(seed);
  const slugBase = (input.originalTitle ?? input.title)
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();

  return {
    mediaRef,
    slug: slugBase || mediaRef,
    type: input.type,
    ids: input.ids as ExternalIds,
    aliases: seed.split('|'),
  };
}

export function createMediaRegistryStub(
  overrides: Partial<
    Pick<MediaRegistryService, 'resolve' | 'resolveOrCreate' | 'resolveOrMergeVerified'>
  > = {},
): MediaRegistryService {
  return {
    resolve: jest.fn().mockResolvedValue(undefined),
    resolveOrCreate: jest.fn().mockImplementation(createIdentity),
    resolveOrMergeVerified: jest.fn().mockImplementation(createIdentity),
    ...overrides,
  } as unknown as MediaRegistryService;
}
