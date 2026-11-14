import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AuditApi } from '../api/audit.api';
import { ClaimsApi } from '../api/claims.api';
import { PatientsApi } from '../api/patients.api';
import { ServerStatusService } from '../api/server-status.service';
import {
  AnomalyResponse,
  AnomalySeverity,
  AuditSummaryResponse,
  BatchResolutionAction,
  ClaimPipeline,
  ClaimResponse,
  ClaimStatus,
  PatientResponse,
  Uuid,
  ScanResponse,
} from '../api/api.models';
import { AuthService } from '../auth/auth.service';
import { apiErrorMessage } from '../ui/format';

export interface Notice {
  kind: 'success' | 'error';
  text: string;
}

const EMPTY_PIPELINE: ClaimPipeline = { OPEN: [], IN_REVIEW: [], APPROVED: [], REJECTED: [] };

/**
 * Estado compartido de la aplicación, cargado desde el backend.
 * Los componentes leen las señales y llaman a estos métodos; nada de datos mock salvo la vista de nube.
 */
@Injectable({ providedIn: 'root' })
export class ErpStore {
  private readonly auth = inject(AuthService);
  private readonly auditApi = inject(AuditApi);
  private readonly claimsApi = inject(ClaimsApi);
  private readonly patientsApi = inject(PatientsApi);
  private readonly server = inject(ServerStatusService);

  readonly anomalies = signal<AnomalyResponse[]>([]);
  readonly lastScan = signal<ScanResponse | null>(null);
  readonly auditSummary = signal<AuditSummaryResponse | null>(null);
  readonly pipeline = signal<ClaimPipeline>(EMPTY_PIPELINE);
  readonly patients = signal<PatientResponse[]>([]);

  readonly loading = signal(false);
  /** Error de carga general (p. ej. backend apagado). */
  readonly loadError = signal<string | null>(null);
  readonly notice = signal<Notice | null>(null);
  readonly lastSync = signal<Date | null>(null);

  readonly severityFilter = signal<'all' | AnomalySeverity>('all');
  readonly visibleAnomalies = computed(() => {
    const filter = this.severityFilter();
    return filter === 'all' ? this.anomalies() : this.anomalies().filter((a) => a.severity === filter);
  });
  readonly allClaims = computed(() => {
    const p = this.pipeline();
    return [...p.OPEN, ...p.IN_REVIEW, ...p.APPROVED, ...p.REJECTED].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    );
  });
  readonly activeClaims = computed(() => this.pipeline().OPEN.length + this.pipeline().IN_REVIEW.length);

  private noticeTimer: ReturnType<typeof setTimeout> | undefined;

  async loadAll(): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      await Promise.all([this.loadAudit(), this.loadClaims(), this.loadPatients()]);
      this.lastSync.set(new Date());
    } catch (error) {
      this.loadError.set(apiErrorMessage(error));
      // Actualiza el estado del servidor: si está caído, la app recargará sola cuando vuelva.
      void this.server.warmUp();
    } finally {
      this.loading.set(false);
    }
  }

  async loadAudit(): Promise<void> {
    if (!this.auth.canAudit()) {
      this.anomalies.set([]);
      this.auditSummary.set(null);
      return;
    }
    const [page, summary] = await Promise.all([
      firstValueFrom(this.auditApi.anomalies({ resolutionStatus: 'OPEN', size: 100 })),
      firstValueFrom(this.auditApi.summary()),
    ]);
    this.anomalies.set(page.content);
    this.auditSummary.set(summary);
  }

  async loadClaims(): Promise<void> {
    this.pipeline.set(await firstValueFrom(this.claimsApi.pipeline()));
  }

  async loadPatients(): Promise<void> {
    const page = await firstValueFrom(this.patientsApi.list(0, 100));
    this.patients.set(page.content);
  }

  /** POST /api/audit/resolve-batch y recarga la bandeja. */
  async resolveAnomalies(ids: Uuid[], action: BatchResolutionAction): Promise<boolean> {
    return this.run(async () => {
      const result = await firstValueFrom(this.auditApi.resolveBatch({ ids, action }));
      await this.loadAudit();
      if (action === 'AUTOCORREGIR') await this.loadPatients();
      const verb = action === 'AUTOCORREGIR' ? 'autocorregidas' : 'archivadas';
      return `${result.processed} anomalía(s) ${verb} correctamente.`;
    });
  }

  async scanAnomalies(): Promise<boolean> {
    return this.run(async () => {
      const result = await firstValueFrom(this.auditApi.scan());
      this.lastScan.set(result);
      await this.loadAudit();
      if (result.created === 0) return `Análisis completado: sin hallazgos nuevos en ${result.analyzedRecords} registros.`;
      return `Análisis completado: ${result.created} hallazgo(s) nuevo(s) en ${result.analyzedRecords} registros.`;
    });
  }

  async moveClaim(claim: ClaimResponse, status: ClaimStatus): Promise<boolean> {
    if (claim.status === status) return true;
    return this.run(async () => {
      await firstValueFrom(this.claimsApi.changeStatus(claim.id, { status }));
      await this.loadClaims();
      return `${claim.claimNumber} movido a la siguiente etapa.`;
    });
  }

  async deleteClaim(claim: ClaimResponse): Promise<boolean> {
    return this.run(async () => {
      await firstValueFrom(this.claimsApi.delete(claim.id));
      await this.loadClaims();
      return `${claim.claimNumber} eliminado.`;
    });
  }

  /** Ejecuta una acción, muestra el resultado como aviso y devuelve si tuvo éxito. */
  async run(action: () => Promise<string>): Promise<boolean> {
    try {
      this.notify({ kind: 'success', text: await action() });
      return true;
    } catch (error) {
      this.notify({ kind: 'error', text: apiErrorMessage(error) });
      return false;
    }
  }

  notify(notice: Notice): void {
    clearTimeout(this.noticeTimer);
    this.notice.set(notice);
    this.noticeTimer = setTimeout(() => this.notice.set(null), 4500);
  }

  reset(): void {
    this.anomalies.set([]);
    this.lastScan.set(null);
    this.auditSummary.set(null);
    this.pipeline.set(EMPTY_PIPELINE);
    this.patients.set([]);
    this.loadError.set(null);
    this.severityFilter.set('all');
  }
}
