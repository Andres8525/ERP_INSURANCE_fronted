import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { environment } from '@env/environment';
import { apiErrorMessage, Fmt } from '@core/ui/format';
import { BillingFilter, ServiceType } from '@core/workers/billing/billing-analytics.core';
import { BillingSource } from '@core/workers/billing/billing-analytics.contract';
import { BillingAnalyticsService } from '@core/workers/billing/billing-analytics.service';
import { WORKER_STATUS_LABEL } from '@core/workers/worker-status';

@Component({
  selector: 'app-billing-panel',
  imports: [FormsModule],
  templateUrl: './billing-panel.component.html',
})
export class BillingPanelComponent {
  private readonly http = inject(HttpClient);
  readonly analytics = inject(BillingAnalyticsService);
  readonly fmt = Fmt;
  readonly statusLabel = WORKER_STATUS_LABEL;
  readonly services: ServiceType[] = ['CONSULTA', 'PROCEDIMIENTO', 'MEDICAMENTO', 'URGENCIA', 'HOSPITALIZACION'];

  readonly count = signal(100_000);
  readonly cie10 = signal('');
  readonly service = signal<ServiceType | ''>('');
  readonly running = signal<'worker' | 'main' | 'backend' | null>(null);
  readonly error = signal<string | null>(null);

  readonly run = this.analytics.lastRun;
  readonly report = computed(() => this.run()?.report ?? null);
  readonly maxChapter = computed(() => Math.max(1, ...(this.report()?.byChapter.map((b) => b.count) ?? [1])));

  filter(): BillingFilter {
    const prefixes = this.cie10()
      .split(/[,\s]+/)
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean);
    return {
      cie10Prefixes: prefixes.length ? prefixes : undefined,
      services: this.service() ? [this.service() as ServiceType] : undefined,
    };
  }

  private synthetic(): BillingSource {
    return { kind: 'synthetic', count: Math.max(1_000, Math.min(500_000, Math.round(this.count()))), seed: 42 };
  }

  async runInWorker(): Promise<void> {
    await this.execute('worker', () => this.analytics.analyze(this.synthetic(), this.filter()));
  }

  async runOnMainThread(): Promise<void> {
    await this.execute('main', async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return this.analytics.runOnMainThread(this.synthetic(), this.filter());
    });
  }

  async runBackendCsv(): Promise<void> {
    await this.execute('backend', async () => {
      const count = Math.max(1_000, Math.min(200_000, Math.round(this.count())));
      const bytes = await firstValueFrom(
        this.http.get(`${environment.apiUrl}/analytics/billing-records.csv`, {
          params: { count, seed: 42 },
          responseType: 'arraybuffer',
        }),
      );
      return this.analytics.analyze({ kind: 'csvBytes', bytes }, this.filter());
    });
  }

  private async execute(kind: 'worker' | 'main' | 'backend', action: () => Promise<unknown>): Promise<void> {
    if (this.running()) return;
    this.running.set(kind);
    this.error.set(null);
    try {
      await action();
    } catch (err) {
      this.error.set(err instanceof HttpErrorResponse ? apiErrorMessage(err) : err instanceof Error ? err.message : String(err));
    } finally {
      this.running.set(null);
    }
  }
}
