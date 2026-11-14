import { Component, OnDestroy, computed, inject } from '@angular/core';
import { TransportMode, VitalSignsService } from '@core/workers/vitals/vital-signs.service';

@Component({
  selector: 'app-vitals-panel',
  templateUrl: './vitals-panel.component.html',
})
export class VitalsPanelComponent implements OnDestroy {
  readonly vitals = inject(VitalSignsService);

  readonly modeLabel = computed(() =>
    this.vitals.mode() === 'shared-memory' ? 'SharedArrayBuffer + Atomics' : 'postMessage (fallback)',
  );

  start(mode?: TransportMode): void {
    void this.vitals.start(mode);
  }

  onBpm(event: Event): void {
    this.vitals.setBpm(Number((event.target as HTMLInputElement).value));
  }

  async benchmark(): Promise<void> {
    await this.vitals.runBenchmark(120);
  }

  speedup(): number | null {
    const result = this.vitals.benchmark();
    if (!result?.sharedMemoryMs) return null;
    return Math.round((result.postMessageMs / result.sharedMemoryMs) * 10) / 10;
  }

  ngOnDestroy(): void {
    this.vitals.stop();
  }
}
