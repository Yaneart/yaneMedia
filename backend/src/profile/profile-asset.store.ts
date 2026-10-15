import {
  Injectable,
  ServiceUnavailableException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import sharp from 'sharp';
import { inspectImage } from '../media/assets/image-metadata';

export const PROFILE_AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const PROFILE_AVATAR_SIZE = 512;
const PROFILE_AVATAR_MAX_INPUT_PIXELS = 40_000_000;
const PROFILE_AVATAR_PROCESSING_TIMEOUT_MS = 10_000;
const PROFILE_ASSET_KEY_PATTERN = /^avatar_[0-9a-f-]{36}\.webp$/;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type StoredProfileAsset = {
  id: string;
  objectKey: string;
  mimeType: 'image/webp';
  width: number;
  height: number;
  byteSize: number;
  checksum: string;
};

export type StoredProfileAssetFile = {
  objectKey: string;
  modifiedAt: Date;
};

@Injectable()
export class ProfileAssetStore {
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.getOrThrow<string>('PROFILE_ASSETS_ROOT'));
  }

  async save(bytes: Buffer, declaredMimeType: string): Promise<StoredProfileAsset> {
    const image = inspectImage(bytes);
    if (
      bytes.length > PROFILE_AVATAR_MAX_BYTES ||
      !image ||
      !ALLOWED_MIME_TYPES.has(declaredMimeType) ||
      image.mimeType !== declaredMimeType ||
      image.width < 1 ||
      image.height < 1 ||
      image.width * image.height > PROFILE_AVATAR_MAX_INPUT_PIXELS
    ) {
      throw unsupportedAvatar();
    }

    const normalizedBytes = await withTimeout(
      sharp(bytes, { failOn: 'error', limitInputPixels: PROFILE_AVATAR_MAX_INPUT_PIXELS })
        .rotate()
        .resize(PROFILE_AVATAR_SIZE, PROFILE_AVATAR_SIZE, { fit: 'cover', position: 'centre' })
        .webp({ quality: 82, effort: 4, smartSubsample: true })
        .toBuffer(),
      PROFILE_AVATAR_PROCESSING_TIMEOUT_MS,
    ).catch((error: unknown) => {
      if (error instanceof ServiceUnavailableException) throw error;
      throw unsupportedAvatar();
    });

    const normalized = inspectImage(normalizedBytes);
    if (
      !normalized ||
      normalized.mimeType !== 'image/webp' ||
      normalized.width !== PROFILE_AVATAR_SIZE ||
      normalized.height !== PROFILE_AVATAR_SIZE
    ) {
      throw unsupportedAvatar();
    }

    const id = randomUUID();
    const objectKey = `avatar_${id}.webp`;
    const checksum = createHash('sha256').update(normalizedBytes).digest('hex');
    const destination = this.resolveAssetPath(objectKey);
    if (!destination) throw new Error('Generated profile asset key is invalid');

    await mkdir(this.root, { recursive: true });
    const temporary = join(this.root, `.${objectKey}.${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, normalizedBytes, { flag: 'wx' });
      await rename(temporary, destination);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }

    return {
      id,
      objectKey,
      mimeType: 'image/webp',
      width: PROFILE_AVATAR_SIZE,
      height: PROFILE_AVATAR_SIZE,
      byteSize: normalizedBytes.length,
      checksum,
    };
  }

  async getPublicAsset(objectKey: string) {
    const path = this.resolveAssetPath(objectKey);
    if (!path) return undefined;

    const file = await stat(path).catch(() => undefined);
    if (!file?.isFile()) return undefined;

    return {
      path,
      mimeType: 'image/webp',
      byteSize: file.size,
      etag: `"${objectKey.slice(7, -5)}"`,
    };
  }

  async listStoredAssets(): Promise<StoredProfileAssetFile[]> {
    await mkdir(this.root, { recursive: true });
    const entries = await readdir(this.root, { withFileTypes: true });
    const assets: StoredProfileAssetFile[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !PROFILE_ASSET_KEY_PATTERN.test(entry.name)) continue;
      const path = this.resolveAssetPath(entry.name);
      if (!path) continue;
      const file = await stat(path);
      assets.push({ objectKey: entry.name, modifiedAt: file.mtime });
    }
    return assets;
  }

  async delete(objectKey: string): Promise<boolean> {
    const path = this.resolveAssetPath(objectKey);
    if (!path) throw new Error('Profile asset cleanup target is outside the configured root');

    try {
      await unlink(path);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  async exists(objectKey: string): Promise<boolean> {
    const path = this.resolveAssetPath(objectKey);
    if (!path) return false;
    return access(path).then(
      () => true,
      () => false,
    );
  }

  private resolveAssetPath(objectKey: string): string | undefined {
    if (!PROFILE_ASSET_KEY_PATTERN.test(objectKey)) return undefined;

    const path = resolve(this.root, objectKey);
    const pathFromRoot = relative(this.root, path);
    if (!pathFromRoot || pathFromRoot.startsWith('..') || isAbsolute(pathFromRoot))
      return undefined;
    return path;
  }
}

function unsupportedAvatar(): UnsupportedMediaTypeException {
  return new UnsupportedMediaTypeException({
    code: 'AVATAR_TYPE_UNSUPPORTED',
    message: 'Файл аватара должен быть корректным JPEG, PNG или WebP',
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new ServiceUnavailableException('Avatar processing timed out')),
      timeoutMs,
    );
  });

  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
