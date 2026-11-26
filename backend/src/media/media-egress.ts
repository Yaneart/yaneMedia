import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { lookup } from 'node:dns/promises';
import { Client, ProxyAgent, type Dispatcher } from 'undici';
import { isPublicIpAddress } from './assets/network-address';

type ConnectOptions = Omit<Dispatcher.ConnectOptions, 'origin'>;
type ConnectCallback = (error: Error | null, data: Dispatcher.ConnectData) => void;

class PublicProxyClient extends Client {
  override connect(options: ConnectOptions): Promise<Dispatcher.ConnectData>;
  override connect(options: ConnectOptions, callback: ConnectCallback): void;
  override connect(
    options: ConnectOptions,
    callback?: (error: Error | null, data?: Dispatcher.ConnectData) => void,
  ) {
    const connection = this.connectPublicAddress(options);
    if (!callback) return connection;
    void connection.then(
      (data) => callback(null, data),
      (error) => callback(error),
    );
  }

  private async connectPublicAddress(options: ConnectOptions): Promise<Dispatcher.ConnectData> {
    const target = new URL(`http://${options.path}`);
    const hostname = target.hostname.replace(/^\[|\]$/g, '');
    const addresses = await lookup(hostname, { all: true, order: 'ipv4first' });
    if (
      addresses.length === 0 ||
      addresses.some(
        ({ address, family }) =>
          !isPublicIpAddress(address) || (family === 6 && !/^[23][0-9a-f]{3}:/i.test(address)),
      )
    ) {
      throw new Error('Media proxy target must resolve to public IP addresses');
    }

    // The proxy connects to the validated IP. Undici still checks TLS against the original host.
    const { address, family } = addresses[0];
    const authority = `${family === 6 ? `[${address}]` : address}:${target.port || 80}`;
    return super.connect({
      ...options,
      path: authority,
      headers: { ...options.headers, host: authority },
    });
  }
}

@Injectable()
export class MediaEgress implements OnModuleDestroy {
  private readonly proxy: ProxyAgent | undefined;

  constructor(config: ConfigService) {
    const socketPath = config.get<string>('MEDIA_EGRESS_SOCKET');
    if (!socketPath) return;
    this.proxy = new ProxyAgent({
      uri: 'http://localhost',
      proxyTunnel: true,
      connectTimeout: 5_000,
      connections: 8,
      clientFactory: (origin) =>
        new PublicProxyClient(origin, { socketPath, connectTimeout: 5_000 }),
    });
  }

  get enabled(): boolean {
    return this.proxy !== undefined;
  }

  fetch(input: string | URL, init?: RequestInit): Promise<Response> {
    const options = this.proxy ? { ...init, dispatcher: this.proxy } : init;
    return fetch(input, options);
  }

  providerOptions() {
    return this.enabled ? { fetch: this.fetch.bind(this) } : {};
  }

  async onModuleDestroy(): Promise<void> {
    await this.proxy?.destroy();
  }
}

export function redirectLocation(response: Response): string | null {
  return [301, 302, 303, 307, 308].includes(response.status)
    ? response.headers.get('location')
    : null;
}
