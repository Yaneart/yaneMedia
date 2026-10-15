import { type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { ProfileAssetStore } from '../../src/profile/profile-asset.store';
import { ProfileAssetsController } from '../../src/profile/profile-assets.controller';
import { ProfileRepository } from '../../src/profile/profile.repository';

describe('profile assets HTTP contract', () => {
  let app: INestApplication;
  let root: string;
  let baseUrl: string;
  let store: ProfileAssetStore;
  const findAssetByObjectKey = jest.fn();

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'yanemedia-profile-assets-http-'));
    store = new ProfileAssetStore(new ConfigService({ PROFILE_ASSETS_ROOT: root }));
    const module = await Test.createTestingModule({
      controllers: [ProfileAssetsController],
      providers: [
        { provide: ProfileAssetStore, useValue: store },
        { provide: ProfileRepository, useValue: { findAssetByObjectKey } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    baseUrl = `${await app.getUrl()}/api/v1/profile-assets`;
  });

  afterAll(async () => {
    await app?.close();
    await rm(root, { recursive: true, force: true });
  });

  it('serves only a published immutable WebP with nosniff and ETag support', async () => {
    const input = await sharp({
      create: { width: 32, height: 48, channels: 3, background: '#2763eb' },
    })
      .png()
      .toBuffer();
    const asset = await store.save(input, 'image/png');
    findAssetByObjectKey.mockResolvedValue({ ...asset, createdAt: new Date() });

    const response = await fetch(`${baseUrl}/${asset.objectKey}`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('cache-control')).toContain('immutable');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(Buffer.from(await response.arrayBuffer()).length).toBe(asset.byteSize);

    const etag = response.headers.get('etag');
    if (!etag) throw new Error('Expected profile asset ETag');
    const cached = await fetch(`${baseUrl}/${asset.objectKey}`, {
      headers: { 'If-None-Match': etag },
    });
    expect(cached.status).toBe(304);
  });

  it('does not expose filesystem orphans or traversal keys', async () => {
    findAssetByObjectKey.mockResolvedValue(undefined);
    const orphan = 'avatar_28b47aca-2c26-482e-bcb8-2f438bb53072.webp';

    expect((await fetch(`${baseUrl}/${orphan}`)).status).toBe(404);
    expect((await fetch(`${baseUrl}/..%2Fsecret.webp`)).status).toBe(404);
  });
});
