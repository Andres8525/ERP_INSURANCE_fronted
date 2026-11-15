import { Injectable, OnDestroy, computed, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';
import { AuthService } from '@core/auth/auth.service';
import { ClinicalRole, HubEvent, HubWelcome, SedeId, realtimeWsUrl } from './realtime.models';

export type HubStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface HubOptions {
  sede: SedeId;
  clinicalRole?: ClinicalRole;
}

const PING_EVERY_MS = 10_000;
const MAX_BACKOFF_MS = 15_000;

export function backoffDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.max(0, attempt - 1));
  return Math.round(base / 2 + random() * (base / 2));
}

@Injectable()
export class MedicalHubService implements OnDestroy {
  private readonly auth = inject(AuthService);
  private socket: WebSocket | null = null;
  private options: HubOptions | null = null;
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private manualClose = false;

  readonly events$ = new Subject<HubEvent>();
  readonly status = signal<HubStatus>('idle');
  readonly welcome = signal<HubWelcome | null>(null);
  readonly latencyMs = signal<number | null>(null);
  readonly lastError = signal<string | null>(null);
  readonly reconnects = signal(0);
  readonly connected = computed(() => this.status() === 'open');

  connect(options: HubOptions): void {
    this.disconnect();
    this.options = options;
    this.manualClose = false;
    this.attempts = 0;
    this.open();
  }

  disconnect(): void {
    this.manualClose = true;
    this.clearTimers();
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) this.socket.close(1000, 'Cierre del usuario');
    this.socket = null;
    this.welcome.set(null);
    this.status.set('idle');
  }

  send(message: Record<string, unknown>): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.lastError.set('Sin conexión con el medical hub');
      return false;
    }
    this.socket.send(JSON.stringify(message));
    return true;
  }

  ngOnDestroy(): void {
    this.disconnect();
    this.events$.complete();
  }

  private open(): void {
    if (!this.options) return;
    const query: Record<string, string> = { sede: this.options.sede };
    if (this.options.clinicalRole) query['clinicalRole'] = this.options.clinicalRole;
    this.status.set(this.attempts === 0 ? 'connecting' : 'reconnecting');
    const socket = new WebSocket(realtimeWsUrl('/ws/medical-hub', query), ['bearer', this.auth.token() ?? '']);
    this.socket = socket;

    socket.onopen = () => {
      this.attempts = 0;
      this.lastError.set(null);
      this.status.set('open');
      this.pingTimer = setInterval(() => this.send({ type: 'ping', sentAt: Date.now() }), PING_EVERY_MS);
      this.send({ type: 'ping', sentAt: Date.now() });
    };
    socket.onmessage = (message: MessageEvent<string>) => this.onMessage(message.data);
    socket.onclose = (event) => {
      this.clearTimers();
      if (this.socket !== socket) return;
      this.welcome.set(null);
      if (this.manualClose) {
        this.status.set('closed');
        return;
      }
      if (event.code === 1006 && this.attempts >= 3) this.lastError.set('No se pudo conectar con el gateway de tiempo real');
      this.scheduleReconnect();
    };
  }

  private onMessage(raw: string): void {
    let event: HubEvent;
    try {
      event = JSON.parse(raw) as HubEvent;
    } catch {
      return;
    }
    if (event.type === 'welcome') this.welcome.set(event as unknown as HubWelcome);
    if (event.type === 'pong' && typeof event['sentAt'] === 'number') this.latencyMs.set(Date.now() - (event['sentAt'] as number));
    if (event.type === 'error') this.lastError.set(String(event['message'] ?? 'Error del hub'));
    this.events$.next(event);
  }

  private scheduleReconnect(): void {
    this.attempts += 1;
    this.reconnects.update((count) => count + 1);
    this.status.set('reconnecting');
    this.reconnectTimer = setTimeout(() => this.open(), backoffDelay(this.attempts));
  }

  private clearTimers(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.pingTimer = null;
    this.reconnectTimer = null;
  }
}
