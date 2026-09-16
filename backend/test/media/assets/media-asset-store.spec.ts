import { ConfigService } from '@nestjs/config';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MediaAssetDownloader } from '../../../src/media/assets/media-asset-downloader';
import { MediaAssetStore } from '../../../src/media/assets/media-asset-store';

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
    expect(first).toMatchObject({
      mimeType: 'image/png',
      width: 1,
      height: 1,
      byteSize: PNG.length,
    });
    expect(await readFile(join(root, 'posters', first.objectKey))).toEqual(PNG);
    expect(await readdir(join(root, 'posters'))).toEqual([first.objectKey]);
    expect(await readdir(join(root, 'backdrops'))).toEqual([]);
    expect(downloader.calls).toBe(2);
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

  it('leaves no file and permits retry when a download is interrupted', async () => {
    downloader.download = () => Promise.reject(new Error('interrupted'));
    await expect(store.import('poster', 'https://images.example/retry')).rejects.toThrow(
      'interrupted',
    );

    downloader.download = (sourceUrl) =>
      Promise.resolve({ bytes: PNG, contentType: 'image/png', sourceUrl });
    await expect(store.import('poster', 'https://images.example/retry')).resolves.toMatchObject({
      mimeType: 'image/png',
    });
    expect((await readdir(join(root, 'posters'))).filter((name) => name.endsWith('.tmp'))).toEqual(
      [],
    );
  });
});
