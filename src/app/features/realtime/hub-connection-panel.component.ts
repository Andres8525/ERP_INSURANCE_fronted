import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '@core/auth/auth.service';
import { MedicalHubService } from '@core/realtime/medical-hub.service';
import { ClinicalRole, RealtimeMetrics, SEDES, SedeId, realtimeHttpUrl, userIdFromToken } from '@core/realtime/realtime.models';

@Component({
  selector: 'app-hub-connection-panel',
  imports: [FormsModule],
  templateUrl: './hub-connection-panel.component.html',
})
export class HubConnectionPanelComponent {
  readonly hub = inject(MedicalHubService);
  private readonly auth = inject(AuthService);
  readonly sedes = SEDES;
  readonly roles: ClinicalRole[] = ['MEDICO', 'ENFERMERO', 'RECEPCION'];
  readonly isAdmin = computed(() => this.auth.role() === 'ADMIN');
  readonly userId = computed(() => userIdFromToken(this.auth.token()));

  sede: SedeId = 'SEDE-MIA';
  clinicalRole: ClinicalRole = 'MEDICO';
  terminals = 2000;

  readonly metrics = signal<RealtimeMetrics | null>(null);
  readonly metricsError = signal<string | null>(null);
  readonly copied = signal(false);
  readonly loadTestBusy = signal(false);
  private metricsTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stopMetrics());
  }

  connect(): void {
    this.hub.connect({ sede: this.sede, ...(this.isAdmin() ? { clinicalRole: this.clinicalRole } : {}) });
    void this.refreshMetrics();
    this.stopMetrics();
    this.metricsTimer = setInterval(() => void this.refreshMetrics(), 5000);
  }

  disconnect(): void {
    this.hub.disconnect();
    this.stopMetrics();
  }

  async copyUserId(): Promise<void> {
    const id = this.userId();
    if (!id || !navigator.clipboard) return;
    await navigator.clipboard.writeText(id);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 1500);
  }

  async simulateTerminals(reset = false): Promise<void> {
    this.loadTestBusy.set(true);
    try {
      const path = reset ? '/api/realtime/load-test/reset' : `/api/realtime/load-test/terminals?count=${this.terminals}`;
      const response = await fetch(realtimeHttpUrl(path), { method: 'POST', headers: this.headers() });
      if (!response.ok) this.metricsError.set(((await response.json()) as { detail?: string }).detail ?? `Error ${response.status}`);
      await this.refreshMetrics();
    } finally {
      this.loadTestBusy.set(false);
    }
  }

  async refreshMetrics(): Promise<void> {
    try {
      const response = await fetch(realtimeHttpUrl('/api/realtime/metrics'), { headers: this.headers(), cache: 'no-store' });
      if (!response.ok) throw new Error(`Error ${response.status}`);
      this.metrics.set((await response.json()) as RealtimeMetrics);
      this.metricsError.set(null);
    } catch (error) {
      this.metricsError.set(error instanceof TypeError ? 'Gateway de tiempo real no disponible' : (error as Error).message);
    }
  }

  statusLabel(): string {
    const labels: Record<string, string> = {
      idle: 'Desconectado',
      connecting: 'Conectando',
      open: 'Conectado',
      reconnecting: 'Reconectando',
      closed: 'Cerrado',
    };
    return labels[this.hub.status()] ?? this.hub.status();
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.auth.token() ?? ''}` };
  }

  private stopMetrics(): void {
    if (this.metricsTimer) clearInterval(this.metricsTimer);
    this.metricsTimer = null;
  }
}
