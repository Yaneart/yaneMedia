import { BadGatewayException } from '@nestjs/common';
import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { MediaAssetDownloader } from '../../../src/media/assets/media-asset-downloader';
import { isPublicIpAddress } from '../../../src/media/assets/network-address';

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

class FakeNetworkDownloader extends MediaAssetDownloader {
  protected override resolve(hostname: string) {
    return Promise.resolve(
      hostname === 'private.example'
        ? [{ address: '127.0.0.1', family: 4 }]
        : [{ address: '93.184.216.34', family: 4 }],
    );
  }

  protected override open(url: URL): Promise<IncomingMessage> {
    return super.open(url, { address: '127.0.0.1', family: 4 });
  }
}

describe('MediaAssetDownloader', () => {
  let server: ReturnType<typeof createServer>;
  let origin: string;

  beforeAll(async () => {
    server = createServer((request, response) => {
      if (request.url === '/redirect') {
        response.writeHead(302, { Location: '/image' }).end();
        return;
      }
      if (request.url === '/private-redirect') {
        response.writeHead(302, { Location: 'http://private.example/image' }).end();
        return;
      }
      if (request.url === '/loop') {
        response.writeHead(302, { Location: '/loop' }).end();
        return;
      }
      if (request.url === '/html') {
        response.writeHead(200, { 'Content-Type': 'text/html' }).end('<html/>');
        return;
      }
      if (request.url === '/svg') {
        response.writeHead(200, { 'Content-Type': 'image/svg+xml' }).end('<svg/>');
        return;
      }
      if (request.url === '/large') {
        response
          .writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': 11 * 1024 * 1024 })
          .end();
        return;
      }
      if (request.url === '/large-stream') {
        response
          .writeHead(200, { 'Content-Type': 'image/png' })
          .end(Buffer.alloc(10 * 1024 * 1024 + 1));
        return;
      }
      if (request.url === '/interrupted') {
        response.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': PNG.length });
        response.write(PNG.subarray(0, 10));
        response.destroy();
        return;
      }
      response
        .writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': PNG.length })
        .end(PNG);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    origin = `http://public.example:${(server.address() as AddressInfo).port}`;
  });

  afterAll(
    () =>
      new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  );

  it('downloads an allowlisted image and follows a bounded safe redirect', async () => {
    const result = await new FakeNetworkDownloader().download(`${origin}/redirect`);
    expect(result).toEqual({ bytes: PNG, contentType: 'image/png', sourceUrl: `${origin}/image` });
  });

  it.each([
    ['unsupported content type', '/html'],
    ['SVG content', '/svg'],
    ['oversized content', '/large'],
    ['oversized streamed content', '/large-stream'],
    ['an interrupted response', '/interrupted'],
    ['too many redirects', '/loop'],
    ['redirect to private network', '/private-redirect'],
  ])('rejects %s', async (_name, path) => {
    await expect(new FakeNetworkDownloader().download(`${origin}${path}`)).rejects.toBeInstanceOf(
      BadGatewayException,
    );
  });

  it.each(['file:///tmp/poster.jpg', 'https://user:password@public.example/image'])(
    'rejects unsafe URL %s',
    async (url) => {
      await expect(new FakeNetworkDownloader().download(url)).rejects.toBeInstanceOf(
        BadGatewayException,
      );
    },
  );

  it('classifies non-public network ranges', () => {
    expect(isPublicIpAddress('8.8.8.8')).toBe(true);
    expect(isPublicIpAddress('127.0.0.1')).toBe(false);
    expect(isPublicIpAddress('10.0.0.1')).toBe(false);
    expect(isPublicIpAddress('169.254.169.254')).toBe(false);
    expect(isPublicIpAddress('::1')).toBe(false);
    expect(isPublicIpAddress('fc00::1')).toBe(false);
    expect(isPublicIpAddress('2606:4700:4700::1111')).toBe(true);
  });
});
