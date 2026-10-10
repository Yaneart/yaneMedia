import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import sharp from 'sharp';
import { inspectImage } from './image-metadata';
import { MediaAssetDownloader } from './media-asset-downloader';

export type MediaAssetKind = 'poster' | 'backdrop';
export type StoredMediaAsset = {
  kind: MediaAssetKind;
  objectKey: string;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
  checksum: string;
  sourceUrl: string;
};

export type StoredMediaAssetFile = Pick<StoredMediaAsset, 'kind' | 'objectKey'> & {
  modifiedAt: Date;
};

const OBJECT_KEY_PATTERN = /^[a-f0-9]{64}\.(?:jpg|png|webp)$/;
const KIND_DIRECTORIES: Record<MediaAssetKind, string> = {
  poster: 'posters',
  backdrop: 'backdrops',
};
export const MEDIA_ASSET_MAX_DIMENSIONS: Record<MediaAssetKind, { width: number; height: number }> =
  {
    poster: { width: 640, height: 960 },
    backdrop: { width: 1920, height: 1080 },
  };
const MEDIA_ASSET_WEBP_QUALITY = 82;

@Injectable()
export class MediaAssetStore implements OnModuleInit {
  private readonly root: string;
  private readonly sourceImports = new Map<string, Promise<StoredMediaAsset>>();

  constructor(
    config: ConfigService,
    private readonly downloader: MediaAssetDownloader,
  ) {
    this.root = resolve(config.getOrThrow<string>('MEDIA_ASSETS_ROOT'));
  }

  async onModuleInit(): Promise<void> {
    await Promise.all(
      Object.values(KIND_DIRECTORIES).map((directory) =>
        mkdir(join(this.root, directory), { recursive: true }),
      ),
    );
  }

  async import(kind: MediaAssetKind, sourceUrl: string): Promise<StoredMediaAsset> {
    const cacheKey = `${kind}:${sourceUrl}`;
    const existing = this.sourceImports.get(cacheKey);
    if (existing) return existing;

    const pending = this.downloadAndStore(kind, sourceUrl).catch((error: unknown) => {
      this.sourceImports.delete(cacheKey);
      throw error;
    });
    this.sourceImports.set(cacheKey, pending);
    return pending;
  }

  private async downloadAndStore(
    kind: MediaAssetKind,
    sourceUrl: string,
  ): Promise<StoredMediaAsset> {
    const download = await this.downloader.download(sourceUrl);
    const image = inspectImage(download.bytes);
    if (
      !image ||
      (download.contentType && image.mimeType !== download.contentType) ||
      image.width < 1 ||
      image.height < 1
    ) {
      throw new Error('Downloaded media asset is not a supported image');
    }

    const dimensions = MEDIA_ASSET_MAX_DIMENSIONS[kind];
    const normalizedBytes = await sharp(download.bytes)
      .rotate()
      .resize({ ...dimensions, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: MEDIA_ASSET_WEBP_QUALITY, effort: 4, smartSubsample: true })
      .toBuffer();
    const normalizedImage = inspectImage(normalizedBytes);
    if (!normalizedImage || normalizedImage.mimeType !== 'image/webp') {
      throw new Error('Failed to normalize media asset');
    }

    const checksum = createHash('sha256').update(normalizedBytes).digest('hex');
    const objectKey = `${checksum}.webp`;
    const directory = join(this.root, KIND_DIRECTORIES[kind]);
    const destination = join(directory, objectKey);

    await mkdir(directory, { recursive: true });
    try {
      await access(destination);
    } catch {
      const temporary = join(directory, `.${objectKey}.${randomUUID()}.tmp`);
      try {
        await writeFile(temporary, normalizedBytes, { flag: 'wx' });
        await rename(temporary, destination);
      } finally {
        await unlink(temporary).catch(() => undefined);
      }
    }

    return {
      kind,
      objectKey,
      mimeType: normalizedImage.mimeType,
      width: normalizedImage.width,
      height: normalizedImage.height,
      byteSize: normalizedBytes.length,
      checksum,
      sourceUrl: download.sourceUrl,
    };
  }

  async getPublicAsset(kindValue: string, objectKey: string) {
    const path = this.resolveAssetPath(kindValue, objectKey);
    if (!path) return undefined;

    const file = await stat(path).catch(() => undefined);
    if (!file?.isFile()) return undefined;

    const extension = objectKey.slice(objectKey.lastIndexOf('.') + 1);
    const mimeType = extension === 'jpg' ? 'image/jpeg' : `image/${extension}`;
    return {
      path,
      mimeType,
      byteSize: file.size,
      etag: `"${objectKey.slice(0, 64)}"`,
    };
  }

  async listStoredAssets(): Promise<StoredMediaAssetFile[]> {
    const assets: StoredMediaAssetFile[] = [];
    for (const kind of Object.keys(KIND_DIRECTORIES) as MediaAssetKind[]) {
      const directory = join(this.root, KIND_DIRECTORIES[kind]);
      const entries = await readdir(directory, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !OBJECT_KEY_PATTERN.test(entry.name)) continue;
        const path = this.resolveAssetPath(kind, entry.name);
        if (!path) continue;
        const file = await stat(path);
        assets.push({ kind, objectKey: entry.name, modifiedAt: file.mtime });
      }
    }
    return assets;
  }

  async delete(kind: MediaAssetKind, objectKey: string): Promise<boolean> {
    const path = this.resolveAssetPath(kind, objectKey);
    if (!path) throw new Error('Media asset cleanup target is outside the configured root');

    try {
      await unlink(path);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  async clear(): Promise<number> {
    const assets = await this.listStoredAssets();
    const deleted = await Promise.all(
      assets.map(({ kind, objectKey }) => this.delete(kind, objectKey)),
    );
    this.sourceImports.clear();
    return deleted.filter(Boolean).length;
  }

  private resolveAssetPath(kindValue: string, objectKey: string): string | undefined {
    if (!(kindValue in KIND_DIRECTORIES) || !OBJECT_KEY_PATTERN.test(objectKey)) return undefined;

    const kind = kindValue as MediaAssetKind;
    const path = resolve(this.root, KIND_DIRECTORIES[kind], objectKey);
    const pathFromRoot = relative(this.root, path);
    if (!pathFromRoot || pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot))
      return undefined;
    return path;
  }
}
