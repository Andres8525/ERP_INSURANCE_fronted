import { Component, computed, inject, output } from '@angular/core';
import { AnomalyResponse } from '../../core/api/api.models';
import { AuthService } from '../../core/auth/auth.service';
import { ErpStore } from '../../core/state/erp.store';
import { Fmt } from '../../core/ui/format';
import { ViewKey } from '../../models/erp.models';

/** Resumen operativo con métricas calculadas a partir de los datos del backend. */
@Component({
  selector: 'app-overview-page',
  templateUrl: './overview-page.component.html',
})
export class OverviewPageComponent {
  readonly store = inject(ErpStore);
  readonly auth = inject(AuthService);
  readonly fmt = Fmt;

  readonly viewChange = output<ViewKey>();
  readonly anomalySelected = output<AnomalyResponse>();

  readonly today = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date())
    .replace(/^./, (c) => c.toUpperCase());
  readonly nextYear = new Date().getFullYear() + 1;

  /** Primera carga en curso: se muestran esqueletos en lugar de ceros provisionales. */
  readonly firstLoad = computed(() => this.store.loading() && this.store.lastSync() === null);

  readonly metrics = computed(() => {
    const patients = this.store.patients();
    const active = [...this.store.pipeline().OPEN, ...this.store.pipeline().IN_REVIEW];
    return {
      totalPatients: patients.length,
      active: patients.filter((p) => p.accountStatus === 'ACTIVE').length,
      pending: patients.filter((p) => p.accountStatus === 'PENDING').length,
      eligible: patients.filter((p) => p.acaEligibilityStatus === 'ELIGIBLE').length,
      activeClaims: active.length,
      highPriority: active.filter((c) => c.priority === 'HIGH').length,
    };
  });

  readonly counts = computed(() => {
    const all = this.store.anomalies();
    return {
      all: all.length,
      RED: all.filter((a) => a.severity === 'RED').length,
      YELLOW: all.filter((a) => a.severity === 'YELLOW').length,
    };
  });

  /** % de pacientes sin hallazgos abiertos. */
  readonly quality = computed(() => {
    const total = this.store.patients().length;
    if (total === 0) return 100;
    const affected = new Set(this.store.anomalies().map((a) => a.patient?.id).filter(Boolean)).size;
    return Math.round(((total - affected) / total) * 1000) / 10;
  });
}
