import { MessageSource, MessageTarget, RpcContract, RpcReply, isRpcRequest } from './rpc';

export interface RpcContext {
  progress(value: number): void;
  transfer(...objects: Transferable[]): void;
}

export type RpcHandlers<C extends RpcContract> = {
  [M in keyof C]: (payload: C[M]['payload'], context: RpcContext) => C[M]['result'] | Promise<C[M]['result']>;
};

export function serveRpc<C extends RpcContract>(scope: MessageTarget & MessageSource, handlers: RpcHandlers<C>): void {
  scope.addEventListener('message', async (event: MessageEvent) => {
    const request = event.data;
    if (!isRpcRequest(request)) return;
    const startedAt = performance.now();
    const transfers: Transferable[] = [];
    let lastProgress = -1;
    const context: RpcContext = {
      progress(value) {
        const rounded = Math.max(0, Math.min(100, Math.round(value)));
        if (rounded === lastProgress) return;
        lastProgress = rounded;
        const reply: RpcReply = { kind: 'progress', requestId: request.requestId, progress: rounded };
        scope.postMessage(reply);
      },
      transfer(...objects) {
        transfers.push(...objects);
      },
    };
    const handler = handlers[request.method as keyof C];
    try {
      if (!handler) throw new Error(`Método desconocido: ${request.method}`);
      const result = await handler(request.payload as C[keyof C]['payload'], context);
      const reply: RpcReply = {
        kind: 'response',
        requestId: request.requestId,
        ok: true,
        result,
        durationMs: Math.round(performance.now() - startedAt),
      };
      scope.postMessage(reply, transfers);
    } catch (error) {
      const reply: RpcReply = {
        kind: 'response',
        requestId: request.requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Math.round(performance.now() - startedAt),
      };
      scope.postMessage(reply);
    }
  });
}
