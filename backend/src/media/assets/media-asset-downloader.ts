import { BadGatewayException, Injectable } from '@nestjs/common';
import { lookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest, type RequestOptions } from 'node:https';
import { isPublicIpAddress } from './network-address';

const MAX_REDIRECTS = 3;
const MAX_BYTES = 10 * 1024 * 1024;
const TIMEOUT_MS = 10_000;
const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type DownloadedAsset = { bytes: Buffer; contentType: string; sourceUrl: string };

@Injectable()
export class MediaAssetDownloader {
  async download(source: string): Promise<DownloadedAsset> {
    let url: URL;
    try {
      url = new URL(source);
    } catch {
      throw new BadGatewayException('Invalid media asset URL');
    }

    for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects += 1) {
      const response = await this.request(url);

      if ([301, 302, 303, 307, 308].includes(response.statusCode ?? 0)) {
        const location = response.headers.location;
        response.resume();
        if (!location || redirects === MAX_REDIRECTS) {
          throw new BadGatewayException('Media asset redirect limit exceeded');
        }
        url = new URL(location, url);
        continue;
      }

      if (response.statusCode !== 200) {
        response.resume();
        throw new BadGatewayException('Media asset download failed');
      }

      const contentType = response.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase();
      if (!contentType || !ALLOWED_CONTENT_TYPES.has(contentType)) {
        response.resume();
        throw new BadGatewayException('Unsupported media asset content type');
      }

      const announcedSize = Number(response.headers['content-length']);
      if (Number.isFinite(announcedSize) && announcedSize > MAX_BYTES) {
        response.resume();
        throw new BadGatewayException('Media asset is too large');
      }

      return {
        bytes: await this.readBody(response),
        contentType,
        sourceUrl: url.toString(),
      };
    }

    throw new BadGatewayException('Media asset download failed');
  }

  protected async resolve(hostname: string): Promise<Array<{ address: string; family: number }>> {
    return lookup(hostname, { all: true, verbatim: true });
  }

  private async request(url: URL): Promise<IncomingMessage> {
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) {
      throw new BadGatewayException('Unsafe media asset URL');
    }

    const addresses = await this.resolve(url.hostname).catch(() => []);
    if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIpAddress(address))) {
      throw new BadGatewayException('Unsafe media asset host');
    }

    return this.open(url, addresses[0]);
  }

  protected open(url: URL, target: { address: string; family: number }): Promise<IncomingMessage> {
    const options: RequestOptions = {
      protocol: url.protocol,
      hostname: target.address,
      family: target.family,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg', Host: url.host },
      servername: url.hostname,
    };

    return new Promise((resolve, reject) => {
      const request = (url.protocol === 'https:' ? httpsRequest : httpRequest)(options, resolve);
      request.setTimeout(TIMEOUT_MS, () => request.destroy(new Error('Media asset timeout')));
      request.once('error', () => reject(new BadGatewayException('Media asset download failed')));
      request.end();
    });
  }

  private readBody(response: IncomingMessage): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;

      response.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BYTES) {
          response.destroy();
          reject(new BadGatewayException('Media asset is too large'));
          return;
        }
        chunks.push(chunk);
      });
      response.once('end', () => resolve(Buffer.concat(chunks, size)));
      response.once('aborted', () =>
        reject(new BadGatewayException('Media asset download interrupted')),
      );
      response.once('error', () => reject(new BadGatewayException('Media asset download failed')));
    });
  }
}
