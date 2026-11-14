import { Injectable, OnDestroy, signal } from '@angular/core';
import { WorkerRpcClient } from '../protocol/worker-rpc-client';
import { WorkerStatus } from '../worker-status';
import { BillingFilter } from './billing-analytics.core';
import { BillingAnalysis, BillingContract, BillingSource } from './billing-analytics.contract';
import { runBillingAnalysis } from './billing-analytics.run';

export type ExecutionMode = 'web-worker' | 'main-thread';

export interface BillingRun extends BillingAnalysis {
  mode: ExecutionMode;
  roundTripMs: number;
}

@Injectable({ providedIn: 'root' })
export class BillingAnalyticsService implements OnDestroy {
  readonly supported = typeof Worker !== 'undefined';
  readonly status = signal<WorkerStatus>(this.supported ? 'idle' : 'unsupported');
  readonly progress = signal(0);
  readonly lastRun = signal<BillingRun | null>(null);
  readonly lastError = signal<string | null>(null);

  private client: WorkerRpcClient<BillingContract> | null = null;

  async analyze(source: BillingSource, filter: BillingFilter = {}): Promise<BillingRun> {
    if (!this.supported) return this.runOnMainThread(source, filter);
    this.status.set('busy');
    this.progress.set(0);
    this.lastError.set(null);
    try {
      const transfer = source.kind === 'csvBytes' ? [source.bytes] : [];
      const { result, roundTripMs } = await this.ensureClient().call('analyze', { source, filter }, {
        transfer,
        timeoutMs: 120_000,
        onProgress: (value) => this.progress.set(value),
      });
      const run: BillingRun = { ...result, mode: 'web-worker', roundTripMs };
      this.lastRun.set(run);
      this.status.set('ready');
      return run;
    } catch (error) {
      this.lastError.set(error instanceof Error ? error.message : String(error));
      this.status.set('error');
      throw error;
    }
  }

  runOnMainThread(source: BillingSource, filter: BillingFilter = {}): BillingRun {
    const startedAt = performance.now();
    const result = runBillingAnalysis({ source, filter });
    const run: BillingRun = { ...result, mode: 'main-thread', roundTripMs: Math.round(performance.now() - startedAt) };
    this.lastRun.set(run);
    return run;
  }

  async ping(): Promise<number> {
    const { roundTripMs } = await this.ensureClient().call('ping', null, { timeoutMs: 5_000 });
    if (this.status() !== 'busy') this.status.set('ready');
    return roundTripMs;
  }

  terminate(): void {
    this.client?.dispose();
    this.client = null;
    if (this.supported) this.status.set('idle');
  }

  ngOnDestroy(): void {
    this.terminate();
  }

  private ensureClient(): WorkerRpcClient<BillingContract> {
    if (!this.client) {
      const worker = new Worker(new URL('./billing-analytics.worker', import.meta.url), {
        type: 'module',
        name: 'billing-analytics',
      });
      worker.addEventListener('error', (event) => {
        this.lastError.set(event.message || 'Error al cargar el worker de facturación.');
        this.status.set('error');
      });
      this.client = new WorkerRpcClient<BillingContract>(worker, 120_000);
    }
    return this.client;
  }
}
