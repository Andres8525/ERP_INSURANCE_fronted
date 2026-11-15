import { Component, computed, inject } from '@angular/core';
import { LabPollingService } from '@core/realtime/lab-polling.service';
import { LabJobKind } from '@core/realtime/realtime.models';

@Component({
  selector: 'app-lab-polling-panel',
  providers: [LabPollingService],
  templateUrl: './lab-polling-panel.component.html',
})
export class LabPollingPanelComponent {
  readonly polling = inject(LabPollingService);
  readonly wasted = computed(() => {
    const stats = this.polling.stats();
    return stats.requests ? Math.round((stats.notModified / stats.requests) * 100) : 0;
  });

  start(kind: LabJobKind): void {
    void this.polling.start(kind);
  }

  label(kind: LabJobKind): string {
    return kind === 'RIPS' ? 'Generación de RIPS' : 'Resultados de laboratorio';
  }
}
