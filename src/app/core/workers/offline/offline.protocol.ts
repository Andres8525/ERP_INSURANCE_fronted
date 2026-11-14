export const SW_VERSION = 'erp-medical-offline-v1';
export const SW_SCRIPT_URL = '/medical-offline.sw.js';
export const STATIC_CACHE = `${SW_VERSION}-static`;
export const CATALOG_CACHE = `${SW_VERSION}-catalogs`;
export const SYNC_TAG = 'medical-outbox';
export const OUTBOX_DB = 'erp-offline';
export const OUTBOX_STORE = 'outbox';

export const QUEUEABLE_WRITES: { method: string; pattern: RegExp }[] = [
  { method: 'PATCH', pattern: /\/api\/claims\/[^/]+\/status$/ },
];

export interface CacheSummary {
  name: string;
  entries: number;
}

export interface SwStatus {
  version: string;
  caches: CacheSummary[];
  outbox: number;
}

export type SwRequest =
  | { type: 'status' }
  | { type: 'flush' }
  | { type: 'clear-caches' }
  | { type: 'precache-catalogs'; urls: string[] };

export type SwBroadcast =
  | { type: 'outbox:queued'; pending: number; url: string }
  | { type: 'outbox:flushed'; flushed: number; pending: number };

export interface QueuedResponseBody {
  queued: true;
  idempotencyKey: string;
}

export function isQueueable(method: string, url: string, hasIdempotencyKey: boolean): boolean {
  if (!hasIdempotencyKey) return false;
  const path = new URL(url, 'http://localhost').pathname;
  return QUEUEABLE_WRITES.some((rule) => rule.method === method.toUpperCase() && rule.pattern.test(path));
}

export function isCatalogRequest(url: string): boolean {
  return /\/api\/catalogs(\/|$)/.test(new URL(url, 'http://localhost').pathname);
}

export function isHashedAsset(pathname: string): boolean {
  return /-[A-Z0-9]{8}\.(js|css)$/.test(pathname) || /\.(woff2?|png|svg|ico)$/.test(pathname);
}

export function isQueuedResponse(body: unknown): body is QueuedResponseBody {
  return typeof body === 'object' && body !== null && (body as QueuedResponseBody).queued === true;
}
