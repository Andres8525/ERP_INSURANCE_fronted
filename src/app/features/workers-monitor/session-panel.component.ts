import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '@core/auth/auth.service';
import { ErpStore } from '@core/state/erp.store';
import { Fmt } from '@core/ui/format';
import { QueuePriority } from '@core/workers/session/session-sync.core';
import { SessionSyncService } from '@core/workers/session/session-sync.service';

@Component({
  selector: 'app-session-panel',
  imports: [FormsModule],
  templateUrl: './session-panel.component.html',
})
export class SessionPanelComponent implements OnInit {
  readonly sync = inject(SessionSyncService);
  private readonly auth = inject(AuthService);
  private readonly store = inject(ErpStore);
  readonly fmt = Fmt;

  readonly name = signal('');
  readonly reason = signal('');
  readonly priority = signal<QueuePriority>('normal');
  readonly records = computed(() => {
    const patients = this.store.patients().slice(0, 5).map((p) => ({ id: p.crmId ?? p.id, label: `${p.firstName} ${p.lastName}` }));
    return patients.length ? patients : [{ id: 'HC-DEMO-1', label: 'Historia clínica de demostración' }];
  });
  readonly modeLabel = computed(() => ({
    'shared-worker': 'Shared Worker',
    local: 'Solo esta pestaña',
    disconnected: 'Desconectado',
  })[this.sync.mode()]);

  get owner(): string {
    return this.auth.email() ?? 'Usuario';
  }

  ngOnInit(): void {
    this.sync.connect(`${this.owner} · ${this.sync.tabId.slice(0, 4)}`);
  }

  add(): void {
    if (!this.name().trim()) return;
    this.sync.addPatient(this.name(), this.reason(), this.priority());
    this.name.set('');
    this.reason.set('');
    this.priority.set('normal');
  }

  call(id: string): void {
    this.sync.callPatient(id, this.owner);
  }

  toggleLock(recordId: string): void {
    if (this.sync.ownsLock(recordId)) this.sync.releaseLock(recordId);
    else this.sync.acquireLock(recordId, this.owner);
  }

  openTab(): void {
    window.open(window.location.href, '_blank');
  }

  waitedMinutes(arrivedAt: number): number {
    return Math.max(0, Math.floor((Date.now() - arrivedAt) / 60_000));
  }
}
