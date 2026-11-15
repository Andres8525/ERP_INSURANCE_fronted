import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { AuthService } from '@core/auth/auth.service';
import { LabJobKind, LabJobStatus, realtimeHttpUrl } from './realtime.models';

export interface PollingStats {
  requests: number;
  notModified: number;
  bytes: number;
  lastLatencyMs: number;
}

const EMPTY_STATS: PollingStats = { requests: 0, notModified: 0, bytes: 0, lastLatencyMs: 0 };

@Injectable()
export class LabPollingService implements OnDestroy {
  private readonly auth = inject(AuthService);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private etag: string | null = null;
  private generation = 0;

  readonly status = signal<LabJobStatus | null>(null);
  readonly running = signal(false);
  readonly error = signal<string | null>(null);
  readonly stats = signal<PollingStats>(EMPTY_STATS);

  async start(kind: LabJobKind): Promise<void> {
    this.stop();
    const generation = ++this.generation;
    this.error.set(null);
    this.stats.set(EMPTY_STATS);
    this.etag = null;
    this.running.set(true);
    try {
      const response = await this.request('/api/realtime/lab-jobs', { method: 'POST', body: JSON.stringify({ kind }) });
      if (!response.ok) throw new Error(await this.problem(response));
      const status = (await response.json()) as LabJobStatus;
      if (generation !== this.generation) return;
      this.status.set(status);
      this.schedule(status.jobId, Number(response.headers.get('X-Poll-Interval') ?? status.recommendedIntervalMs), generation);
    } catch (error) {
      this.fail(error);
    }
  }

  stop(): void {
    this.generation += 1;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.running.set(false);
  }

  ngOnDestroy(): void {
    this.stop();
  }

  private schedule(jobId: string, intervalMs: number, generation: number): void {
    if (!intervalMs || intervalMs <= 0) {
      this.running.set(false);
      return;
    }
    this.timer = setTimeout(() => void this.poll(jobId, generation), intervalMs);
  }

  private async poll(jobId: string, generation: number): Promise<void> {
    const startedAt = performance.now();
    try {
      const headers: Record<string, string> = this.etag ? { 'If-None-Match': this.etag } : {};
      const response = await this.request(`/api/realtime/lab-status-polling?jobId=${encodeURIComponent(jobId)}`, { headers });
      if (generation !== this.generation) return;
      const latency = Math.round(performance.now() - startedAt);
      if (response.status === 304) {
        this.stats.update((stats) => ({ ...stats, requests: stats.requests + 1, notModified: stats.notModified + 1, lastLatencyMs: latency }));
        this.schedule(jobId, Number(response.headers.get('X-Poll-Interval') ?? 3000), generation);
        return;
      }
      if (!response.ok) throw new Error(await this.problem(response));
      const text = await response.text();
      const status = JSON.parse(text) as LabJobStatus;
      this.etag = response.headers.get('ETag');
      this.status.set(status);
      this.stats.update((stats) => ({ ...stats, requests: stats.requests + 1, bytes: stats.bytes + text.length, lastLatencyMs: latency }));
      this.schedule(jobId, Number(response.headers.get('X-Poll-Interval') ?? status.recommendedIntervalMs), generation);
    } catch (error) {
      if (generation === this.generation) this.fail(error);
    }
  }

  private request(path: string, init: RequestInit = {}): Promise<Response> {
    return fetch(realtimeHttpUrl(path), {
      ...init,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${this.auth.token() ?? ''}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
  }

  private async problem(response: Response): Promise<string> {
    try {
      return ((await response.json()) as { detail?: string }).detail ?? `Error ${response.status}`;
    } catch {
      return `Error ${response.status}`;
    }
  }

  private fail(error: unknown): void {
    this.running.set(false);
    this.error.set(error instanceof TypeError ? 'No se pudo conectar con el gateway de tiempo real' : (error as Error).message);
  }
}
