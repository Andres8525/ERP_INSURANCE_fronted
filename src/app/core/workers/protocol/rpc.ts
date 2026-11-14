export type RpcContract = Record<string, { payload: unknown; result: unknown }>;

export interface RpcRequest<C extends RpcContract = RpcContract, M extends keyof C & string = keyof C & string> {
  kind: 'request';
  requestId: string;
  method: M;
  payload: C[M]['payload'];
}

export interface RpcProgress {
  kind: 'progress';
  requestId: string;
  progress: number;
}

export interface RpcSuccess<R = unknown> {
  kind: 'response';
  requestId: string;
  ok: true;
  result: R;
  durationMs: number;
}

export interface RpcFailure {
  kind: 'response';
  requestId: string;
  ok: false;
  error: string;
  durationMs: number;
}

export type RpcReply<R = unknown> = RpcProgress | RpcSuccess<R> | RpcFailure;

export interface MessageTarget {
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

export interface MessageSource {
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
}

export type RpcEndpoint = MessageTarget & MessageSource & { terminate?(): void };

export function isRpcRequest(value: unknown): value is RpcRequest {
  return typeof value === 'object' && value !== null && (value as RpcRequest).kind === 'request'
    && typeof (value as RpcRequest).requestId === 'string' && typeof (value as RpcRequest).method === 'string';
}

export function isRpcReply(value: unknown): value is RpcReply {
  if (typeof value !== 'object' || value === null) return false;
  const kind = (value as RpcReply).kind;
  return (kind === 'response' || kind === 'progress') && typeof (value as RpcReply).requestId === 'string';
}
