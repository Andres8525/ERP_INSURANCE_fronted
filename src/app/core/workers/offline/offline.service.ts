import { Injectable, OnDestroy, signal } from '@angular/core';
import { environment } from '@env/environment';
import { CATALOG_CACHE, SW_SCRIPT_URL, SwBroadcast, SwRequest, SwStatus } from './offline.protocol';

export type ServiceWorkerState = 'unsupported' | 'registering' | 'installing' | 'active' | 'error';

export interface CatalogProbe {
  url: string;
  status: number;
  entries: number;
  wasCached: boolean;
  durationMs: number;
}

@Injectable({ providedIn: 'root' })
export class OfflineService implements OnDestroy {
  readonly supported = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  readonly state = signal<ServiceWorkerState>(this.supported ? 'registering' : 'unsupported');
  readonly controlled = signal(false);
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  readonly status = signal<SwStatus | null>(null);
  readonly lastEvent = signal<SwBroadcast | null>(null);
  readonly lastError = signal<string | null>(null);

  readonly catalogUrls = [`${environment.apiUrl}/catalogs/icd10`, `${environment.apiUrl}/catalogs/medications`];

  private registration: ServiceWorkerRegistration | null = null;
  private readonly onOnline = () => {
    this.online.set(true);
    void this.flush();
  };
  private readonly onOffline = () => this.online.set(false);
  private readonly onMessage = (event: MessageEvent<SwBroadcast>) => {
    this.lastEvent.set(event.data);
    void this.refresh();
  };

  async register(): Promise<void> {
    if (!this.supported || this.registration) return;
    window.addEventListener('online', this.onOnline);
    window.addEventListener('offline', this.onOffline);
    navigator.serviceWorker.addEventListener('message', this.onMessage);
    navigator.serviceWorker.addEventListener('controllerchange', () => this.controlled.set(!!navigator.serviceWorker.controller));
    try {
      this.registration = await navigator.serviceWorker.register(SW_SCRIPT_URL, { scope: '/' });
      this.controlled.set(!!navigator.serviceWorker.controller);
      this.track(this.registration);
      await navigator.serviceWorker.ready;
      this.state.set('active');
      await this.refresh();
    } catch (error) {
      this.state.set('error');
      this.lastError.set(error instanceof Error ? error.message : String(error));
    }
  }

  async refresh(): Promise<SwStatus | null> {
    const status = await this.send<SwStatus>({ type: 'status' });
    if (status) this.status.set(status);
    return status;
  }

  async precacheCatalogs(): Promise<number> {
    const result = await this.send<{ cached: number }>({ type: 'precache-catalogs', urls: this.catalogUrls });
    await this.refresh();
    return result?.cached ?? 0;
  }

  async flush(): Promise<number> {
    const result = await this.send<{ flushed: number }>({ type: 'flush' });
    await this.refresh();
    return result?.flushed ?? 0;
  }

  async clearCaches(): Promise<void> {
    await this.send({ type: 'clear-caches' });
    await this.refresh();
  }

  async probeCatalog(url = this.catalogUrls[0]): Promise<CatalogProbe> {
    const wasCached = typeof caches !== 'undefined' && !!(await (await caches.open(CATALOG_CACHE)).match(url));
    const startedAt = performance.now();
    const response = await fetch(url, { mode: 'cors' });
    const body = (await response.json()) as unknown[];
    return { url, status: response.status, entries: Array.isArray(body) ? body.length : 0, wasCached, durationMs: Math.round(performance.now() - startedAt) };
  }

  ngOnDestroy(): void {
    if (!this.supported) return;
    window.removeEventListener('online', this.onOnline);
    window.removeEventListener('offline', this.onOffline);
    navigator.serviceWorker.removeEventListener('message', this.onMessage);
  }

  private track(registration: ServiceWorkerRegistration): void {
    const installing = registration.installing ?? registration.waiting;
    if (installing) {
      this.state.set('installing');
      installing.addEventListener('statechange', () => {
        if (installing.state === 'activated') this.state.set('active');
      });
    }
  }

  private send<T>(message: SwRequest, timeoutMs = 10_000): Promise<T | null> {
    const target = navigator.serviceWorker?.controller ?? this.registration?.active;
    if (!target) return Promise.resolve(null);
    return new Promise<T | null>((resolve) => {
      const channel = new MessageChannel();
      const timer = setTimeout(() => resolve(null), timeoutMs);
      channel.port1.onmessage = (event) => {
        clearTimeout(timer);
        resolve(event.data as T);
      };
      target.postMessage(message, [channel.port2]);
    });
  }
}
