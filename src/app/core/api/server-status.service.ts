import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '@env/environment';

/**
 * checking: primera comprobación en curso · waking: tarda más de lo normal (Render despertando)
 * ready: el backend responde · offline: no respondió dentro del tiempo límite.
 */
export type ServerState = 'checking' | 'waking' | 'ready' | 'offline';

/** Si no responde en este tiempo, probablemente Render está arrancando el servicio. */
export const WAKING_THRESHOLD_MS = 3000;
/** Un arranque en frío de Render free puede tardar ~1 min; se espera un poco más. */
export const WARM_UP_TIMEOUT_MS = 100_000;
/** Render free suspende tras 15 min sin tráfico: ping cada 10 min mientras la app está abierta. */
export const KEEP_ALIVE_INTERVAL_MS = 10 * 60_000;

/**
 * Despierta el backend (GET /actuator/health) y expone su estado para la interfaz.
 * Las llamadas concurrentes comparten la misma petición en curso.
 */
@Injectable({ providedIn: 'root' })
export class ServerStatusService {
  private readonly http = inject(HttpClient);

  readonly state = signal<ServerState>('checking');
  /** Tiempo de respuesta de la última comprobación correcta, en ms. */
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

  /**
   * Mantiene despierto el backend mientras la app está abierta y visible: ping periódico y, al volver
   * a la pestaña tras un rato, comprobación inmediata. Las pestañas ocultas no generan tráfico.
   */
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
