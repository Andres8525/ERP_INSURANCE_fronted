import { Component, computed, inject, output, signal } from '@angular/core';
import { AnomalyResponse, AnomalySeverity, BatchResolutionAction } from '@core/api/api.models';
import { ErpStore } from '@core/state/erp.store';
import { Fmt } from '@core/ui/format';

@Component({
  selector: 'app-audit-page',
  templateUrl: './audit-page.component.html',
})
export class AuditPageComponent {
  readonly store = inject(ErpStore);
  readonly fmt = Fmt;
  readonly anomalySelected = output<AnomalyResponse>();

  readonly selectedIds = signal<ReadonlySet<string>>(new Set());
  readonly busy = signal<BatchResolutionAction | 'scan' | null>(null);

  readonly visible = this.store.visibleAnomalies;
  readonly selected = computed(() => this.store.anomalies().filter((a) => this.selectedIds().has(a.id)));
  readonly selectedAutoCorrectable = computed(() => this.selected().filter((a) => a.autoCorrectable));
  readonly allVisibleSelected = computed(
    () => this.visible().length > 0 && this.visible().every((a) => this.selectedIds().has(a.id)),
  );
  readonly counts = computed(() => {
    const all = this.store.anomalies();
    return {
      all: all.length,
      RED: all.filter((a) => a.severity === 'RED').length,
      YELLOW: all.filter((a) => a.severity === 'YELLOW').length,
    };
  });

  setFilter(filter: 'all' | AnomalySeverity): void {
    this.store.severityFilter.set(filter);
  }

  toggle(id: string): void {
    this.selectedIds.update((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  clearSelection(): void {
    this.selectedIds.set(new Set());
  }

  toggleAllVisible(): void {
    const ids = this.visible().map((a) => a.id);
    this.selectedIds.set(this.allVisibleSelected() ? new Set() : new Set(ids));
  }

  async resolveSelected(action: BatchResolutionAction): Promise<void> {
    const targets = action === 'AUTOCORREGIR' ? this.selectedAutoCorrectable() : this.selected();
    if (targets.length === 0 || this.busy()) return;
    this.busy.set(action);
    const ok = await this.store.resolveAnomalies(targets.map((a) => a.id), action);
    this.busy.set(null);
    if (ok) this.selectedIds.set(new Set());
  }

  readonly lastScan = this.store.lastScan;

  engineLabel(mode: 'REMOTE' | 'IN_PROCESS'): string {
    return mode === 'REMOTE' ? 'microservicio gRPC' : 'motor gRPC en proceso';
  }

  async rescan(): Promise<void> {
    if (this.busy()) return;
    this.busy.set('scan');
    await this.store.scanAnomalies();
    this.busy.set(null);
  }
}
