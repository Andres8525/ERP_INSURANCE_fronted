import { Component, DestroyRef, afterNextRender, inject, signal } from '@angular/core';
import { detectCapabilities } from '@core/workers/worker-status';
import { BillingPanelComponent } from './billing-panel.component';
import { FrameMeter, FrameSample } from './main-thread-meter';
import { OfflinePanelComponent } from './offline-panel.component';
import { SessionPanelComponent } from './session-panel.component';
import { VitalsPanelComponent } from './vitals-panel.component';

interface Capability {
  label: string;
  enabled: boolean;
  detail: string;
}

@Component({
  selector: 'app-workers-monitor-page',
  imports: [BillingPanelComponent, SessionPanelComponent, OfflinePanelComponent, VitalsPanelComponent],
  templateUrl: './workers-monitor-page.component.html',
})
export class WorkersMonitorPageComponent {
  readonly capabilities = detectCapabilities();
  readonly frame = signal<FrameSample>({ fps: 0, longestFrameMs: 0, blockedFrames: 0 });

  readonly badges: Capability[] = [
    { label: 'crossOriginIsolated', enabled: this.capabilities.crossOriginIsolated, detail: 'COOP same-origin + COEP require-corp' },
    { label: 'SharedArrayBuffer', enabled: this.capabilities.sharedArrayBuffer, detail: 'Memoria compartida entre hilos' },
    { label: 'Atomics.waitAsync', enabled: this.capabilities.atomicsWaitAsync, detail: 'Espera sin bloquear el hilo principal' },
    { label: 'Web Worker', enabled: this.capabilities.webWorker, detail: 'Procesamiento en segundo plano' },
    { label: 'Shared Worker', enabled: this.capabilities.sharedWorker, detail: 'Estado entre pestañas' },
    { label: 'Service Worker', enabled: this.capabilities.serviceWorker, detail: 'Caché y modo offline' },
    { label: 'Background Sync', enabled: this.capabilities.backgroundSync, detail: 'Reenvío al recuperar la red' },
  ];

  constructor() {
    const meter = new FrameMeter();
    let handle = 0;
    let lastPublish = 0;
    const loop = (timestamp: number) => {
      meter.record(timestamp);
      if (timestamp - lastPublish > 250) {
        lastPublish = timestamp;
        this.frame.set(meter.sample());
      }
      handle = requestAnimationFrame(loop);
    };
    afterNextRender(() => {
      handle = requestAnimationFrame(loop);
    });
    inject(DestroyRef).onDestroy(() => cancelAnimationFrame(handle));
  }
}
