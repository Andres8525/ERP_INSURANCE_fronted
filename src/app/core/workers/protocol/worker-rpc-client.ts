import { RpcContract, RpcEndpoint, RpcReply, RpcRequest, isRpcReply } from './rpc';

export interface CallOptions {
  transfer?: Transferable[];
  timeoutMs?: number;
  onProgress?: (progress: number) => void;
}

export interface CallResult<R> {
  result: R;
  durationMs: number;
  roundTripMs: number;
}

interface Pending {
  resolve: (value: CallResult<unknown>) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  startedAt: number;
  onProgress?: (progress: number) => void;
}

export class WorkerRpcError extends Error {
  constructor(message: string, readonly requestId: string) {
    super(message);
    this.name = 'WorkerRpcError';
  }
}

export class WorkerRpcClient<C extends RpcContract> {
  private readonly pending = new Map<string, Pending>();
  private sequence = 0;
  private disposed = false;

  constructor(
    private readonly endpoint: RpcEndpoint,
    private readonly defaultTimeoutMs = 60_000,
  ) {
    endpoint.addEventListener('message', this.onMessage);
  }

  get inFlight(): number {
    return this.pending.size;
  }

  call<M extends keyof C & string>(method: M, payload: C[M]['payload'], options: CallOptions = {}): Promise<CallResult<C[M]['result']>> {
    if (this.disposed) return Promise.reject(new Error('El worker ya fue detenido.'));
    const requestId = `${Date.now().toString(36)}-${(++this.sequence).toString(36)}`;
    const request: RpcRequest<C, M> = { kind: 'request', requestId, method, payload };
    return new Promise<CallResult<C[M]['result']>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new WorkerRpcError(`El worker no respondió a "${method}" en ${options.timeoutMs ?? this.defaultTimeoutMs} ms.`, requestId));
      }, options.timeoutMs ?? this.defaultTimeoutMs);
      this.pending.set(requestId, {
        resolve: resolve as (value: CallResult<unknown>) => void,
        reject,
        timer,
        startedAt: performance.now(),
        onProgress: options.onProgress,
      });
      try {
        this.endpoint.postMessage(request, options.transfer ?? []);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.endpoint.removeEventListener('message', this.onMessage);
    for (const [requestId, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new WorkerRpcError('El worker se detuvo antes de responder.', requestId));
    }
    this.pending.clear();
    this.endpoint.terminate?.();
  }

  private readonly onMessage = (event: MessageEvent): void => {
    const reply = event.data as RpcReply;
    if (!isRpcReply(reply)) return;
    const pending = this.pending.get(reply.requestId);
    if (!pending) return;
    if (reply.kind === 'progress') {
      pending.onProgress?.(reply.progress);
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(reply.requestId);
    if (reply.ok) {
      pending.resolve({
        result: reply.result,
        durationMs: reply.durationMs,
        roundTripMs: Math.round(performance.now() - pending.startedAt),
      });
    } else {
      pending.reject(new WorkerRpcError(reply.error, reply.requestId));
    }
  };
}
