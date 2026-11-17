import { EventEmitter } from 'node:events';
import { createServer, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Response } from 'express';
import { stopDisconnectedTorrent } from '../../src/torrent/torrent-admission-lifetime';

function fixture() {
  const response = Object.assign(new EventEmitter(), { writableFinished: false, destroyed: false });
  const stop = jest.fn().mockResolvedValue(undefined);
  let resolve!: (session: { sessionId: string }) => void;
  let reject!: (error: Error) => void;
  const admission = new Promise<{ sessionId: string }>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  const result = stopDisconnectedTorrent(response as unknown as Response, admission, stop);
  return { response, stop, resolve, reject, result };
}

test.each(['before', 'after', 'already destroyed'])(
  'stops an interrupted admission %s receiving its ID exactly once',
  async (timing) => {
    const f = fixture();
    if (timing === 'before') f.response.emit('close');
    if (timing === 'already destroyed') f.response.destroyed = true;
    f.resolve({ sessionId: 'owned-session' });
    await f.result;
    f.response.emit('close');
    expect(f.stop).toHaveBeenCalledTimes(1);
    expect(f.stop).toHaveBeenCalledWith('owned-session');
    expect(f.response.listenerCount('close')).toBe(0);
    expect(f.response.listenerCount('finish')).toBe(0);
  },
);

test('a completed response retains its session and removes disconnect listeners', async () => {
  const f = fixture();
  f.resolve({ sessionId: 'owned-session' });
  await f.result;
  f.response.writableFinished = true;
  f.response.emit('finish');
  f.response.emit('close');
  expect(f.stop).not.toHaveBeenCalled();
  expect(f.response.listenerCount('close')).toBe(0);
  expect(f.response.listenerCount('finish')).toBe(0);
});

test('a rejected admission removes listeners and cannot stop an unrelated session', async () => {
  const f = fixture();
  f.reject(new Error('admission denied'));
  await expect(f.result).rejects.toThrow('admission denied');
  f.response.emit('close');
  expect(f.stop).not.toHaveBeenCalled();
  expect(f.response.listenerCount('close')).toBe(0);
  expect(f.response.listenerCount('finish')).toBe(0);
});

test('a real HTTP disconnect stops admission that completes after the socket closes', async () => {
  let admit!: () => void;
  let received!: () => void;
  let disconnected!: () => void;
  let stopped!: () => void;
  const opened = new Promise<void>((done) => {
    received = done;
  });
  const closed = new Promise<void>((done) => {
    disconnected = done;
  });
  const finished = new Promise<void>((done) => {
    stopped = done;
  });
  const stop = jest.fn(() => {
    stopped();
    return Promise.resolve();
  });
  const server = createServer((_request, response) => {
    const admission = new Promise<{ sessionId: string }>((done) => {
      admit = () => done({ sessionId: 'owned-session' });
    });
    response.once('close', disconnected);
    void stopDisconnectedTorrent(response as unknown as Response, admission, stop);
    received();
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  const client = request({
    host: '127.0.0.1',
    port: (server.address() as AddressInfo).port,
    method: 'POST',
  });
  client.on('error', () => {});
  try {
    client.end();
    await opened;
    client.destroy();
    await closed;
    admit();
    await finished;
    expect(stop).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledWith('owned-session');
  } finally {
    client.destroy();
    await new Promise<void>((done) => server.close(() => done()));
  }
});
