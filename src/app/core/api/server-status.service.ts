import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '@env/environment';

export type ServerState = 'checking' | 'waking' | 'ready' | 'offline';

export const WAKING_THRESHOLD_MS = 3000;

export const WARM_UP_TIMEOUT_MS = 100_000;

export const KEEP_ALIVE_INTERVAL_MS = 10 * 60_000;

@Injectable({ providedIn: 'root' })
export class ServerStatusService {
  private readonly http = inject(HttpClient);

  readonly state = signal<ServerState>('checking');

  readonly latencyMs = signal<number | null>(null);
  readonly lastCheck = signal<Date | null>(null);

  private pending: Promise<boolean> | null = null;
  private keepAliveTimer: ReturnType<typeof setInterval> | undefined;

  warmUp(): Promise<boolean> {
    if (this.pending) return this.pending;
    const startedAt = performance.now();
    if (this.state() !== 'ready') this.state.set('checking');
    const wakingTimer = setTimeout(() => {
      if (this.state() !== 'ready') this.state.set('waking');
    }, WAKING_THRESHOLD_MS);

    this.pending = firstValueFrom(this.http.get(environment.healthUrl).pipe(timeout(WARM_UP_TIMEOUT_MS)))
      .then(() => {
        this.latencyMs.set(Math.round(performance.now() - startedAt));
        this.state.set('ready');
        return true;
      })
      .catch(() => {
        this.state.set('offline');
        return false;
      })
      .finally(() => {
        clearTimeout(wakingTimer);
        this.lastCheck.set(new Date());
        this.pending = null;
      });
    return this.pending;
  }

  startKeepAlive(intervalMs = KEEP_ALIVE_INTERVAL_MS): void {
    if (this.keepAliveTimer || typeof document === 'undefined') return;
    const pingIfVisible = () => {
      if (document.visibilityState === 'visible') void this.warmUp();
    };
    this.keepAliveTimer = setInterval(pingIfVisible, intervalMs);
    document.addEventListener('visibilitychange', () => {
      const last = this.lastCheck()?.getTime() ?? 0;
      if (document.visibilityState === 'visible' && Date.now() - last > intervalMs / 2) void this.warmUp();
    });
  }

  stopKeepAlive(): void {
    clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = undefined;
  }
}
