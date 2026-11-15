import { Component, computed, inject, signal } from '@angular/core';
import { AlarmLevel } from '@core/realtime/realtime.models';
import { BedState, VitalsStreamService } from '@core/realtime/vitals-stream.service';
import { sparklinePoints } from './sparkline';

export const ICU_BEDS = ['UCI-01', 'UCI-02', 'UCI-03', 'UCI-04', 'UCI-05', 'UCI-06'];

@Component({
  selector: 'app-vitals-stream-panel',
  providers: [VitalsStreamService],
  templateUrl: './vitals-stream-panel.component.html',
})
export class VitalsStreamPanelComponent {
  readonly stream = inject(VitalsStreamService);
  readonly beds = ICU_BEDS;
  readonly selected = signal<ReadonlySet<string>>(new Set(['UCI-01', 'UCI-02', 'UCI-03']));
  readonly cards = computed(() => {
    const states = this.stream.beds();
    return [...this.selected()].sort().map((bedId) => ({ bedId, state: (states[bedId] as BedState | undefined) ?? null }));
  });
  readonly points = sparklinePoints;

  toggle(bedId: string): void {
    this.selected.update((current) => {
      const next = new Set(current);
      if (next.has(bedId)) next.delete(bedId);
      else next.add(bedId);
      return next;
    });
    if (this.stream.status() !== 'idle') this.connect();
  }

  connect(): void {
    this.stream.connect([...this.selected()]);
  }

  alarmClass(level: AlarmLevel | undefined): string {
    switch (level) {
      case 'CRITICAL':
        return 'border-rose-300 bg-rose-50';
      case 'WARNING':
        return 'border-amber-300 bg-amber-50/60';
      default:
        return 'border-slate-200 bg-white';
    }
  }

  statusLabel(): string {
    switch (this.stream.status()) {
      case 'open':
        return 'Stream abierto';
      case 'connecting':
        return 'Conectando';
      case 'reconnecting':
        return 'Reconectando';
      case 'error':
        return 'Error';
      default:
        return 'Desconectado';
    }
  }
}
