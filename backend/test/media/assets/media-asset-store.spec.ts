import { ConfigService } from '@nestjs/config';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { MediaAssetDownloader } from '../../../src/media/assets/media-asset-downloader';
import {
  MEDIA_ASSET_MAX_DIMENSIONS,
  MediaAssetStore,
} from '../../../src/media/assets/media-asset-store';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

class FakeDownloader extends MediaAssetDownloader {
  calls = 0;

  override download(sourceUrl: string) {
    this.calls += 1;
    return Promise.resolve({ bytes: PNG, contentType: 'image/png', sourceUrl });
  }
}

describe('MediaAssetStore', () => {
  let root: string;
  let downloader: FakeDownloader;
  let store: MediaAssetStore;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'yanemedia-assets-'));
    downloader = new FakeDownloader();
    store = new MediaAssetStore(new ConfigService({ MEDIA_ASSETS_ROOT: root }), downloader);
    await store.onModuleInit();
  });

  afterEach(() => rm(root, { recursive: true, force: true }));

  it('sniffs, checksum-addresses and deduplicates an image through an atomic file', async () => {
    const first = await store.import('poster', 'https://images.example/poster');
    const concurrent = store.import('poster', 'https://images.example/poster-copy');
    const second = await store.import('poster', 'https://images.example/poster-copy');

    await expect(concurrent).resolves.toEqual(second);
    expect(second.objectKey).toBe(first.objectKey);
    expect(first).toMatchObject({ mimeType: 'image/webp', width: 1, height: 1 });
    expect(first.objectKey).toMatch(/^[a-f0-9]{64}\.webp$/);
    expect(await readFile(join(root, 'posters', first.objectKey))).toHaveLength(first.byteSize);
    expect(await readdir(join(root, 'posters'))).toEqual([first.objectKey]);
    expect(await readdir(join(root, 'backdrops'))).toEqual([]);
    expect(downloader.calls).toBe(2);
  });

  it('normalizes catalog artwork to bounded WebP dimensions without enlargement', async () => {
    const posterSource = await sharp({
      create: { width: 1200, height: 1800, channels: 3, background: '#336699' },
    })
      .png()
      .toBuffer();
    const backdropSource = await sharp({
      create: { width: 2400, height: 1350, channels: 3, background: '#663399' },
    })
      .jpeg()
      .toBuffer();
    downloader.download = (sourceUrl) => {
      const isPoster = sourceUrl.endsWith('/poster');
      return Promise.resolve({
        bytes: isPoster ? posterSource : backdropSource,
        contentType: isPoster ? 'image/png' : 'image/jpeg',
        sourceUrl,
      });
    };

    const poster = await store.import('poster', 'https://images.example/poster');
    const backdrop = await store.import('backdrop', 'https://images.example/backdrop');

    expect(poster).toMatchObject({
      mimeType: 'image/webp',
      ...MEDIA_ASSET_MAX_DIMENSIONS.poster,
    });
    expect(backdrop).toMatchObject({
      mimeType: 'image/webp',
      ...MEDIA_ASSET_MAX_DIMENSIONS.backdrop,
    });
    expect(poster.byteSize).toBeLessThan(posterSource.length);
    expect(backdrop.byteSize).toBeLessThan(backdropSource.length);
  });

  it('rejects mismatched and unsupported content without leaving a file', async () => {
    downloader.download = (sourceUrl) =>
      Promise.resolve({
        bytes: Buffer.from('<svg/>'),
        contentType: 'image/png',
        sourceUrl,
      });

    await expect(store.import('backdrop', 'https://images.example/not-image')).rejects.toThrow(
      'not a supported image',
    );
    expect(await readdir(join(root, 'backdrops'))).toEqual([]);

    downloader.download = (sourceUrl) =>
      Promise.resolve({ bytes: PNG, contentType: 'image/jpeg', sourceUrl });
    await expect(store.import('backdrop', 'https://images.example/wrong-mime')).rejects.toThrow(
      'not a supported image',
    );
  });

  it('does not allow arbitrary kinds or object keys during reads', async () => {
    expect(await store.getPublicAsset('poster', '../secret.png')).toBeUndefined();
    expect(await store.getPublicAsset('other', `${'a'.repeat(64)}.png`)).toBeUndefined();
  });

  it('keeps cleanup targets inside the configured asset root', async () => {
    await expect(store.delete('poster', '../secret.png')).rejects.toThrow(
      'outside the configured root',
    );
    await expect(store.delete('backdrop', `${'d'.repeat(64)}.jpg`)).resolves.toBe(false);
  });

  it('clears all stored posters and backdrops', async () => {
    await store.import('poster', 'https://image.tmdb.org/poster');
    await store.import('backdrop', 'https://image.tmdb.org/backdrop');

    await expect(store.clear()).resolves.toBe(2);
    expect(await readdir(join(root, 'posters'))).toEqual([]);
    expect(await readdir(join(root, 'backdrops'))).toEqual([]);
  });

  it('leaves no file and permits retry when a download is interrupted', async () => {
    downloader.download = () => Promise.reject(new Error('interrupted'));
    await expect(store.import('poster', 'https://images.example/retry')).rejects.toThrow(
      'interrupted',
    );

    downloader.download = (sourceUrl) =>
      Promise.resolve({ bytes: PNG, contentType: 'image/png', sourceUrl });
    await expect(store.import('poster', 'https://images.example/retry')).resolves.toMatchObject({
      mimeType: 'image/webp',
    });
    expect((await readdir(join(root, 'posters'))).filter((name) => name.endsWith('.tmp'))).toEqual(
      [],
    );
  });
});
