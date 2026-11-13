import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { AnomalyResponse } from './core/api/api.models';
import { AuthService } from './core/auth/auth.service';
import { ErpStore } from './core/state/erp.store';
import { Fmt } from './core/ui/format';
import { CLOUD_ARCHIVE_DEMO, NAVIGATION_ITEMS } from './data/erp.demo-data';
import { AnomalyDetailComponent } from './features/audit/anomaly-detail.component';
import { AuditPageComponent } from './features/audit/audit-page.component';
import { LoginPageComponent } from './features/auth/login-page.component';
import { ClaimsPageComponent } from './features/claims/claims-page.component';
import { CloudArchiveComponent } from './features/cloud/cloud-archive.component';
import { EnrollmentPageComponent } from './features/enrollment/enrollment-page.component';
import { OverviewPageComponent } from './features/overview/overview-page.component';
import { PatientProfileComponent } from './features/patient/patient-profile.component';
import { ViewKey } from './models/erp.models';

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
  readonly fmt = Fmt;

  readonly activeView = signal<ViewKey>('overview');
  /** Menú lateral en móvil (overlay). */
  readonly sidebarOpen = signal(false);
  /** Menú lateral colapsado a solo iconos en escritorio. */
  readonly sidebarCollapsed = signal(false);
  readonly selectedAnomaly = signal<AnomalyResponse | null>(null);
  /** Paciente a mostrar al entrar en la vista Pacientes (p. ej. tras una afiliación). */
  readonly focusPatientId = signal<string | null>(null);
  readonly archiveCandidates = CLOUD_ARCHIVE_DEMO;

  readonly sections = ['OPERACIONES', 'GESTIÓN', 'SISTEMA'] as const;
  readonly navItems = computed(() =>
    NAVIGATION_ITEMS.filter((item) => !item.requiresAudit || this.auth.canAudit()),
  );
  readonly viewTitle = computed(() => VIEW_TITLES[this.activeView()]);

  constructor() {
    // Al iniciar sesión (o recargar con sesión vigente) se cargan los datos del backend.
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
