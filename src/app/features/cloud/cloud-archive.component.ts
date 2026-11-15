import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { RetentionCandidate, RetentionCategory, RetentionDecision, RetentionProfile } from '@core/api/api.models';
import { AuditApi } from '@core/api/audit.api';
import { apiErrorMessage, Fmt } from '@core/ui/format';

export type RetentionFilter = 'all' | Exclude<RetentionDecision, 'KEEP'>;

export interface DecisionView {
  label: string;
  short: string;
  badge: string;
  bar: string;
}

export const DECISIONS: Record<RetentionDecision, DecisionView> = {
  DELETE: { label: 'Eliminar definitivamente', short: 'Eliminar', badge: 'border-rose-200 bg-rose-50 text-rose-800', bar: 'bg-rose-500' },
  ARCHIVE: { label: 'Archivar en almacenamiento frío', short: 'Archivar', badge: 'border-sky-200 bg-sky-50 text-sky-800', bar: 'bg-sky-500' },
  LEGAL_HOLD: { label: 'Retención legal', short: 'Retención legal', badge: 'border-amber-200 bg-amber-50 text-amber-800', bar: 'bg-amber-500' },
  KEEP: { label: 'Mantener', short: 'Mantener', badge: 'border-slate-200 bg-slate-50 text-slate-600', bar: 'bg-teal-600' },
};

const CATEGORY_LABEL: Record<RetentionCategory, string> = {
  POLICY: 'Póliza',
  CLAIM: 'Siniestro',
  PATIENT_FILE: 'Expediente',
};

export function formatUsd(value: number): string {
  const digits = Math.abs(value) > 0 && Math.abs(value) < 1 ? 4 : 2;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: digits }).format(value);
}

export function formatInactivity(months: number): string {
  if (months < 24) return `${months} meses`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return rest ? `${years} años y ${rest} m` : `${years} años`;
}

@Component({
  selector: 'app-cloud-archive',
  templateUrl: './cloud-archive.component.html',
})
export class CloudArchiveComponent {
  private readonly api = inject(AuditApi);
  readonly decisions = DECISIONS;
  readonly usd = formatUsd;
  readonly inactivity = formatInactivity;
  readonly fmt = Fmt;
  readonly filters: Exclude<RetentionFilter, 'all'>[] = ['DELETE', 'ARCHIVE', 'LEGAL_HOLD'];
  readonly ruleDecisions: RetentionDecision[] = ['ARCHIVE', 'DELETE', 'LEGAL_HOLD'];

  readonly profile = signal<RetentionProfile | null>(null);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly filter = signal<RetentionFilter>('all');

  readonly summary = computed(() => this.profile()?.summary ?? null);
  readonly candidates = computed(() => this.profile()?.candidates ?? []);
  readonly visible = computed(() => {
    const filter = this.filter();
    return filter === 'all' ? this.candidates() : this.candidates().filter((candidate) => candidate.decision === filter);
  });
  readonly counts = computed<Record<RetentionFilter, number>>(() => {
    const summary = this.summary();
    return { all: this.candidates().length, DELETE: summary?.delete ?? 0, ARCHIVE: summary?.archive ?? 0, LEGAL_HOLD: summary?.legalHold ?? 0 };
  });
  readonly distribution = computed(() => {
    const summary = this.summary();
    if (!summary || summary.profiled === 0) return [];
    const order: RetentionDecision[] = ['KEEP', 'ARCHIVE', 'DELETE', 'LEGAL_HOLD'];
    const values: Record<RetentionDecision, number> = {
      KEEP: summary.keep,
      ARCHIVE: summary.archive,
      DELETE: summary.delete,
      LEGAL_HOLD: summary.legalHold,
    };
    return order.map((decision) => ({
      decision,
      count: values[decision],
      percent: Math.round((values[decision] / summary.profiled) * 1000) / 10,
      view: DECISIONS[decision],
    }));
  });

  constructor() {
    void this.load();
  }

  async load(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set(null);
    try {
      this.profile.set(await firstValueFrom(this.api.retention()));
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  setFilter(filter: RetentionFilter): void {
    this.filter.set(filter);
  }

  categoryLabel(candidate: RetentionCandidate): string {
    return CATEGORY_LABEL[candidate.category];
  }

  megabytes(value: number): string {
    return `${new Intl.NumberFormat('es', { maximumFractionDigits: value >= 100 ? 0 : 1 }).format(value)} MB`;
  }

  share(part: number, total: number): number {
    return total > 0 ? (part / total) * 100 : 0;
  }
}
