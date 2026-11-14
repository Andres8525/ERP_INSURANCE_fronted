/// <reference lib="webworker" />

import {
  CATALOG_CACHE,
  OUTBOX_DB,
  OUTBOX_STORE,
  STATIC_CACHE,
  SW_VERSION,
  SYNC_TAG,
  SwBroadcast,
  SwRequest,
  SwStatus,
  isCatalogRequest,
  isHashedAsset,
  isQueueable,
} from './offline.protocol';

declare const self: ServiceWorkerGlobalScope;

interface OutboxEntry {
  id?: number;
  url: string;
  method: string;
  headers: [string, string][];
  body: string | null;
  createdAt: number;
  attempts: number;
}

const APP_SHELL = ['/', '/index.html', '/favicon.ico'];
const OWN_CACHES = [STATIC_CACHE, CATALOG_CACHE];

function openOutbox(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OUTBOX_DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(OUTBOX_STORE, { keyPath: 'id', autoIncrement: true });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function outbox<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openOutbox();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = run(db.transaction(OUTBOX_STORE, mode).objectStore(OUTBOX_STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

async function broadcast(message: SwBroadcast): Promise<void> {
  const clients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  for (const client of clients) client.postMessage(message);
}

async function cacheFirst(request: Request, cacheName: string, revalidate: boolean): Promise<Response> {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) {
    if (revalidate) void fetch(request).then((fresh) => (fresh.ok ? cache.put(request, fresh) : undefined)).catch(() => undefined);
    return cached;
  }
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function networkFirst(request: Request, cacheName: string, fallbackUrl?: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(fallbackUrl ?? request, response.clone());
    return response;
  } catch (error) {
    const cached = (await cache.match(request)) ?? (fallbackUrl ? await cache.match(fallbackUrl) : undefined);
    if (cached) return cached;
    throw error;
  }
}

async function networkOrQueue(request: Request): Promise<Response> {
  const body = request.method === 'GET' || request.method === 'HEAD' ? null : await request.clone().text();
  try {
    return await fetch(request);
  } catch {
    const entry: OutboxEntry = {
      url: request.url,
      method: request.method,
      headers: [...request.headers.entries()],
      body,
      createdAt: Date.now(),
      attempts: 0,
    };
    await outbox('readwrite', (store) => store.add(entry));
    const pending = await outbox('readonly', (store) => store.count());
    const registration = self.registration as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } };
    await registration.sync?.register(SYNC_TAG).catch(() => undefined);
    await broadcast({ type: 'outbox:queued', pending, url: request.url });
    return new Response(JSON.stringify({ queued: true, idempotencyKey: request.headers.get('Idempotency-Key') }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function flushOutbox(): Promise<number> {
  const entries = await outbox<OutboxEntry[]>('readonly', (store) => store.getAll() as IDBRequest<OutboxEntry[]>);
  let flushed = 0;
  let networkFailure = false;
  for (const entry of entries) {
    try {
      const response = await fetch(entry.url, {
        method: entry.method,
        headers: entry.headers,
        body: entry.body,
        mode: 'cors',
      });
      if (response.ok || (response.status >= 400 && response.status < 500)) {
        await outbox('readwrite', (store) => store.delete(entry.id!));
        flushed++;
      }
    } catch {
      networkFailure = true;
      break;
    }
  }
  const pending = await outbox('readonly', (store) => store.count());
  await broadcast({ type: 'outbox:flushed', flushed, pending });
  if (networkFailure && pending > 0) throw new Error('Sin conexión: la cola se reintentará.');
  return flushed;
}

async function status(): Promise<SwStatus> {
  const names = (await caches.keys()).filter((name) => OWN_CACHES.includes(name));
  const summaries = await Promise.all(names.map(async (name) => ({ name, entries: (await (await caches.open(name)).keys()).length })));
  return { version: SW_VERSION, caches: summaries, outbox: await outbox('readonly', (store) => store.count()) };
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => Promise.all(APP_SHELL.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith('erp-medical-offline') && !OWN_CACHES.includes(name)).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET') {
    if (isQueueable(request.method, request.url, request.headers.has('Idempotency-Key'))) {
      event.respondWith(networkOrQueue(request));
    }
    return;
  }
  if (isCatalogRequest(request.url)) {
    event.respondWith(cacheFirst(request, CATALOG_CACHE, true));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, STATIC_CACHE, '/index.html'));
    return;
  }
  if (isHashedAsset(url.pathname)) event.respondWith(cacheFirst(request, STATIC_CACHE, false));
});

self.addEventListener('sync', (event: Event) => {
  const syncEvent = event as ExtendableEvent & { tag: string };
  if (syncEvent.tag === SYNC_TAG) syncEvent.waitUntil(flushOutbox());
});

self.addEventListener('message', (event) => {
  const message = event.data as SwRequest;
  const reply = (value: unknown) => event.ports[0]?.postMessage(value);
  const work = (async () => {
    switch (message?.type) {
      case 'status':
        reply(await status());
        break;
      case 'flush':
        reply({ flushed: await flushOutbox().catch(() => 0) });
        break;
      case 'clear-caches':
        await Promise.all(OWN_CACHES.map((name) => caches.delete(name)));
        reply({ cleared: true });
        break;
      case 'precache-catalogs': {
        const cache = await caches.open(CATALOG_CACHE);
        const results = await Promise.allSettled(message.urls.map((url) => cache.add(new Request(url, { mode: 'cors' }))));
        reply({ cached: results.filter((r) => r.status === 'fulfilled').length });
        break;
      }
      default:
        reply({ error: 'Mensaje desconocido' });
    }
  })();
  event.waitUntil(work);
});
