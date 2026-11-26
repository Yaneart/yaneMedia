import { createServer } from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigService } from '@nestjs/config';
import { MediaEgress } from '../../src/media/media-egress';

it('tunnels public addresses over the configured socket and rejects private ones', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'media-egress-'));
  const path = join(dir, 'proxy.sock');
  const targets: string[] = [];
  const server = createServer();
  server.on('connect', (request, socket) => {
    targets.push(request.url ?? '');
    socket.end('HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n');
  });
  await new Promise<void>((resolve) => server.listen(path, resolve));
  const egress = new MediaEgress({ get: () => path } as ConfigService);
  try {
    await expect(
      egress.fetch('https://127.0.0.1/', { signal: AbortSignal.timeout(1_000) }),
    ).rejects.toMatchObject({
      cause: { message: 'Media proxy target must resolve to public IP addresses' },
    });
    expect(targets).toEqual([]);
    await expect(
      egress.fetch('https://1.1.1.1/', { signal: AbortSignal.timeout(1_000) }),
    ).rejects.toThrow();
    expect(targets).toEqual(['1.1.1.1:443']);
  } finally {
    await egress.onModuleDestroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(dir, { recursive: true, force: true });
  }
});
