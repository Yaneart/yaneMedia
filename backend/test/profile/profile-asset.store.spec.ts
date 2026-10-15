import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { PROFILE_AVATAR_MAX_BYTES, ProfileAssetStore } from '../../src/profile/profile-asset.store';

describe('ProfileAssetStore', () => {
  let root: string;
  let store: ProfileAssetStore;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'yanemedia-profile-assets-'));
    store = new ProfileAssetStore(new ConfigService({ PROFILE_ASSETS_ROOT: root }));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it.each([
    ['jpeg', 'image/jpeg'],
    ['png', 'image/png'],
    ['webp', 'image/webp'],
  ] as const)(
    'normalizes real %s bytes into a metadata-free square WebP',
    async (format, mimeType) => {
      const input = await sharp({
        create: { width: 900, height: 600, channels: 3, background: '#2763eb' },
      })
        .withMetadata({ comment: 'private metadata' })
        .toFormat(format)
        .toBuffer();

      const asset = await store.save(input, mimeType);
      const output = await readFile(join(root, asset.objectKey));
      const metadata = await sharp(output).metadata();

      expect(asset).toMatchObject({ mimeType: 'image/webp', width: 512, height: 512 });
      expect(asset.objectKey).toMatch(/^avatar_[0-9a-f-]{36}\.webp$/);
      expect(metadata).toMatchObject({ format: 'webp', width: 512, height: 512 });
      expect(metadata.exif).toBeUndefined();
      expect(metadata.icc).toBeUndefined();
    },
  );

  it.each([
    [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'image/svg+xml'],
    [Buffer.from('not an image'), 'image/png'],
  ])('rejects active or corrupted input bytes', async (bytes, mimeType) => {
    await expect(store.save(bytes, mimeType)).rejects.toMatchObject({
      response: { code: 'AVATAR_TYPE_UNSUPPORTED' },
    });
  });

  it('rejects a false declared MIME type and an oversized buffer', async () => {
    const png = await sharp({
      create: { width: 16, height: 16, channels: 3, background: '#000' },
    })
      .png()
      .toBuffer();

    await expect(store.save(png, 'image/jpeg')).rejects.toMatchObject({
      response: { code: 'AVATAR_TYPE_UNSUPPORTED' },
    });
    await expect(
      store.save(Buffer.alloc(PROFILE_AVATAR_MAX_BYTES + 1), 'image/png'),
    ).rejects.toMatchObject({ response: { code: 'AVATAR_TYPE_UNSUPPORTED' } });
  });

  it('never resolves traversal keys and removes only managed files', async () => {
    await expect(store.getPublicAsset('../avatar_test.webp')).resolves.toBeUndefined();
    await expect(store.delete('../avatar_test.webp')).rejects.toThrow('outside');

    const input = await sharp({
      create: { width: 32, height: 32, channels: 3, background: '#000' },
    })
      .png()
      .toBuffer();
    const asset = await store.save(input, 'image/png');
    await expect(store.exists(asset.objectKey)).resolves.toBe(true);
    await expect(store.delete(asset.objectKey)).resolves.toBe(true);
    await expect(store.exists(asset.objectKey)).resolves.toBe(false);
  });
});
