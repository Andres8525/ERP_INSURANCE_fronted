import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { AnomalyResponse } from './core/api/api.models';
import { ServerStatusService } from './core/api/server-status.service';
import { AuthService } from './core/auth/auth.service';
import { ErpStore } from './core/state/erp.store';
import { Fmt } from './core/ui/format';
import { CLOUD_ARCHIVE_DEMO } from './features/cloud/cloud-archive.data';
import { AnomalyDetailComponent } from './features/audit/anomaly-detail.component';
import { AuditPageComponent } from './features/audit/audit-page.component';
import { LoginPageComponent } from './features/auth/login-page.component';
import { ClaimsPageComponent } from './features/claims/claims-page.component';
import { CloudArchiveComponent } from './features/cloud/cloud-archive.component';
import { EnrollmentPageComponent } from './features/enrollment/enrollment-page.component';
import { OverviewPageComponent } from './features/overview/overview-page.component';
import { PatientProfileComponent } from './features/patient/patient-profile.component';
import { NAVIGATION_ITEMS, ViewKey } from './core/layout/navigation';

const VIEW_TITLES: Record<ViewKey, string> = {
  overview: 'Resumen',
  audit: 'Auditoría IA',
  claims: 'Siniestros',
  enrollment: 'Afiliaciones',
  patient: 'Pacientes',
  cloud: 'Optimización nube',
};

@Component({
  selector: 'app-root',
  imports: [
    LoginPageComponent,
    OverviewPageComponent,
    AuditPageComponent,
    AnomalyDetailComponent,
    ClaimsPageComponent,
    EnrollmentPageComponent,
    PatientProfileComponent,
    CloudArchiveComponent,
  ],
  templateUrl: './app.html',
})
export class App {
  readonly auth = inject(AuthService);
  readonly store = inject(ErpStore);
  readonly server = inject(ServerStatusService);

  readonly serverOk = computed(() => this.server.state() === 'ready' && !this.store.loadError());
  readonly fmt = Fmt;

  readonly activeView = signal<ViewKey>('overview');

  readonly sidebarOpen = signal(false);

  readonly sidebarCollapsed = signal(false);
  readonly selectedAnomaly = signal<AnomalyResponse | null>(null);

  readonly focusPatientId = signal<string | null>(null);
  readonly archiveCandidates = CLOUD_ARCHIVE_DEMO;

  readonly sections = ['OPERACIONES', 'GESTIÓN', 'SISTEMA'] as const;
  readonly navItems = computed(() =>
    NAVIGATION_ITEMS.filter((item) => !item.requiresAudit || this.auth.canAudit()),
  );
  readonly viewTitle = computed(() => VIEW_TITLES[this.activeView()]);

  constructor() {
    if (this.auth.isAuthenticated()) {
      this.auth.verifySession().subscribe({ error: () => undefined });
    }

    let previousState = this.server.state();
    effect(() => {
      const state = this.server.state();
      const recovered = state === 'ready' && previousState === 'offline';
      previousState = state;
      if (recovered && this.auth.isAuthenticated()) {
        untracked(() => {
          if (this.store.loadError()) void this.store.loadAll();
          this.store.notify({ kind: 'success', text: 'Conexión con el servidor restablecida.' });
        });
      }
    });

    effect(() => {
      if (this.auth.isAuthenticated()) {
        untracked(() => void this.store.loadAll());
      } else {
        untracked(() => {
          this.store.reset();
          this.activeView.set('overview');
          this.selectedAnomaly.set(null);
        });
      }
    });
  }

  navCount(key: ViewKey): number | null {
    if (key === 'audit') return this.store.auditSummary()?.open ?? null;
    if (key === 'claims') return this.store.activeClaims() || null;
    if (key === 'patient') return this.store.patients().length || null;
    return null;
  }

  setView(view: ViewKey): void {
    this.activeView.set(view);
    this.sidebarOpen.set(false);
  }

  openPatient(patientId: string): void {
    this.focusPatientId.set(patientId);
    this.setView('patient');
  }

  logout(): void {
    this.auth.logout();
  }
}
