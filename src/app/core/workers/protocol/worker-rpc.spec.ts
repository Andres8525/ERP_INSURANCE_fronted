import { afterEach, describe, expect, it, vi } from 'vitest';
import { RpcEndpoint } from './rpc';
import { serveRpc } from './rpc-server';
import { WorkerRpcClient, WorkerRpcError } from './worker-rpc-client';

type Contract = {
  sum: { payload: number[]; result: number };
  fail: { payload: string; result: never };
  slow: { payload: number; result: number };
};

function channelPair(): { client: RpcEndpoint; server: RpcEndpoint } {
  const channel = new MessageChannel();
  channel.port1.start();
  channel.port2.start();
  return { client: channel.port1, server: channel.port2 };
}

describe('WorkerRpcClient + serveRpc', () => {
  let client: WorkerRpcClient<Contract> | undefined;

  afterEach(() => {
    client?.dispose();
    vi.useRealTimers();
  });

  it('correlaciona respuestas por requestId y reporta progreso', async () => {
    const { client: port, server } = channelPair();
    serveRpc<Contract>(server, {
      sum: (values, ctx) => {
        ctx.progress(50);
        return values.reduce((a, b) => a + b, 0);
      },
      fail: (message) => {
        throw new Error(message);
      },
      slow: (value) => new Promise((resolve) => setTimeout(() => resolve(value), 20)),
    });
    client = new WorkerRpcClient<Contract>(port);
    const progress: number[] = [];

    const [slow, sum] = await Promise.all([
      client.call('slow', 7),
      client.call('sum', [1, 2, 3], { onProgress: (p) => progress.push(p) }),
    ]);

    expect(sum.result).toBe(6);
    expect(slow.result).toBe(7);
    expect(progress).toEqual([50]);
    expect(client.inFlight).toBe(0);
  });

  it('propaga los errores del worker', async () => {
    const { client: port, server } = channelPair();
    serveRpc<Contract>(server, { sum: () => 0, fail: (m) => { throw new Error(m); }, slow: (v) => v });
    client = new WorkerRpcClient<Contract>(port);

    await expect(client.call('fail', 'CIE-10 inválido')).rejects.toThrow('CIE-10 inválido');
  });

  it('vence por tiempo y rechaza lo pendiente al detenerse', async () => {
    const { client: port } = channelPair();
    client = new WorkerRpcClient<Contract>(port, 30);

    await expect(client.call('sum', [1])).rejects.toBeInstanceOf(WorkerRpcError);
    const pending = client.call('sum', [1], { timeoutMs: 5_000 });
    client.dispose();
    await expect(pending).rejects.toThrow('se detuvo');
  });
});
