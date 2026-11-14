import { Component, inject, input, output, signal } from '@angular/core';
import { AnomalyResponse, BatchResolutionAction } from '@core/api/api.models';
import { ErpStore } from '@core/state/erp.store';
import { Fmt } from '@core/ui/format';

@Component({
  selector: 'app-anomaly-detail',
  templateUrl: './anomaly-detail.component.html',
  host: { '(document:keydown.escape)': 'closed.emit()' },
})
export class AnomalyDetailComponent {
  private readonly store = inject(ErpStore);
  readonly fmt = Fmt;

  readonly anomaly = input.required<AnomalyResponse>();
  readonly closed = output<void>();
  readonly busy = signal<BatchResolutionAction | null>(null);

  async resolve(action: BatchResolutionAction): Promise<void> {
    if (this.busy()) return;
    this.busy.set(action);
    const ok = await this.store.resolveAnomalies([this.anomaly().id], action);
    this.busy.set(null);
    if (ok) this.closed.emit();
  }
}
