import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MediaAssetStore } from '../../../src/media/assets/media-asset-store';
import { MediaAssetsController } from '../../../src/media/assets/media-assets.controller';

const CHECKSUM = 'a'.repeat(64);
const OBJECT_KEY = `${CHECKSUM}.png`;
const BODY = Buffer.from('local-image');

describe('media asset HTTP contract', () => {
  let app: INestApplication;
  let root: string;
  let origin: string;

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'yanemedia-assets-http-'));
    const path = join(root, OBJECT_KEY);
    await writeFile(path, BODY);

    const module = await Test.createTestingModule({
      controllers: [MediaAssetsController],
      providers: [
        {
          provide: MediaAssetStore,
          useValue: {
            getCardBackdrop: (objectKey: string) =>
              Promise.resolve(
                objectKey === OBJECT_KEY
                  ? {
                      path,
                      mimeType: 'image/webp',
                      byteSize: BODY.length,
                      etag: `"${OBJECT_KEY}-card-v1"`,
                    }
                  : undefined,
              ),
            getPublicAsset: (kind: string, objectKey: string) =>
              Promise.resolve(
                kind === 'poster' && objectKey === OBJECT_KEY
                  ? {
                      path,
                      mimeType: 'image/png',
                      byteSize: BODY.length,
                      etag: `"${CHECKSUM}"`,
                    }
                  : undefined,
              ),
          },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    origin = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
  });

  it('serves the exact bytes with immutable metadata and supports conditional GET', async () => {
    const url = `${origin}/api/v1/media/assets/poster/${OBJECT_KEY}`;
    const response = await fetch(url);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('content-length')).toBe(String(BODY.length));
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(response.headers.get('etag')).toBe(`"${CHECKSUM}"`);
    expect(response.headers.get('vary')).toBe('Origin');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(BODY);

    const cached = await fetch(url, { headers: { 'If-None-Match': `"${CHECKSUM}"` } });
    expect(cached.status).toBe(304);
    expect(await cached.text()).toBe('');
  });

  it('returns 404 for a non-addressable path', async () => {
    const response = await fetch(`${origin}/api/v1/media/assets/poster/not-an-object-key`);
    expect(response.status).toBe(404);
  });

  it('serves the fixed card variant with its own immutable ETag and conditional GET', async () => {
    const url = `${origin}/api/v1/media/assets/backdrop/${OBJECT_KEY}/card`;
    const response = await fetch(url);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(response.headers.get('content-length')).toBe(String(BODY.length));
    expect(Buffer.from(await response.arrayBuffer())).toEqual(BODY);
    const etag = response.headers.get('etag')!;
    expect(etag).toBe(`"${OBJECT_KEY}-card-v1"`);

    const cached = await fetch(url, { headers: { 'If-None-Match': etag } });
    expect(cached.status).toBe(304);
    expect(await cached.text()).toBe('');
    const originalEtag = await fetch(url, { headers: { 'If-None-Match': `"${CHECKSUM}"` } });
    expect(originalEtag.status).toBe(200);
    expect((await fetch(`${origin}/api/v1/media/assets/backdrop/missing/card`)).status).toBe(404);
  });
});
