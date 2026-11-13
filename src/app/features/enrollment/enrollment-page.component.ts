import { Component, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AcaEligibilityStatus, PatientResponse } from '../../core/api/api.models';
import { ClaimsApi } from '../../core/api/claims.api';
import { PatientsApi } from '../../core/api/patients.api';
import { ErpStore } from '../../core/state/erp.store';
import { Fmt, apiErrorMessage } from '../../core/ui/format';
import { ViewKey } from '../../models/erp.models';

interface EnrollmentForm {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  city: string;
  householdSize: number | null;
  householdIncome: number | null;
  hasCoverage: boolean | null;
  insurer: string;
  metalLevel: string;
  monthlyPremium: number | null;
  coverageStart: string;
  services: Record<string, boolean>;
}

/** Guías federales de pobreza (48 estados) usadas para la estimación ACA del MVP. */
const FPL_BASE = 15_650;
const FPL_PER_PERSON = 5_500;

export const LINKED_SERVICES = [
  'Transporte médico',
  'Coordinación de cuidados',
  'Entrega de equipo médico',
  'Recordatorios de citas',
] as const;

const STEP_TITLES = ['Datos del paciente', 'Elegibilidad ACA', 'Plan y servicios'] as const;

function firstOfNextMonth(): string {
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
}

function emptyForm(): EnrollmentForm {
  return {
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    email: '',
    phone: '',
    city: '',
    householdSize: null,
    householdIncome: null,
    hasCoverage: null,
    insurer: '',
    metalLevel: '',
    monthlyPremium: null,
    coverageStart: firstOfNextMonth(),
    services: Object.fromEntries(LINKED_SERVICES.map((s) => [s, false])),
  };
}

/**
 * Stepper de afiliación. Al completar:
 * POST /api/patients → POST /api/patients/{id}/policies → (si hay servicios) POST /api/claims.
 */
@Component({
  selector: 'app-enrollment-page',
  imports: [FormsModule],
  templateUrl: './enrollment-page.component.html',
})
export class EnrollmentPageComponent {
  private readonly patientsApi = inject(PatientsApi);
  private readonly claimsApi = inject(ClaimsApi);
  private readonly store = inject(ErpStore);
  readonly fmt = Fmt;

  readonly patientCreated = output<string>();
  readonly viewChange = output<ViewKey>();

  readonly steps = [1, 2, 3] as const;
  readonly stepTitles = STEP_TITLES;
  readonly services = LINKED_SERVICES;
  readonly insurers = ['Ambetter', 'Oscar Health', 'Florida Blue', 'Molina Healthcare', 'Aetna CVS Health'];
  readonly metalLevels = ['Bronze', 'Silver', 'Gold', 'Platinum'];

  readonly step = signal(1);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly created = signal<PatientResponse | null>(null);
  /** Copia en señal del formulario para que los `computed` reaccionen (zoneless). */
  private readonly snapshot = signal<EnrollmentForm>(emptyForm());
  form: EnrollmentForm = emptyForm();

  readonly fplPercent = computed(() => {
    const { householdSize, householdIncome } = this.snapshot();
    if (!householdSize || householdIncome === null) return null;
    return Math.round((householdIncome / (FPL_BASE + FPL_PER_PERSON * (householdSize - 1))) * 100);
  });

  readonly eligibility = computed<AcaEligibilityStatus>(() => {
    const pct = this.fplPercent();
    if (pct === null) return 'UNKNOWN';
    if (this.snapshot().hasCoverage) return 'PENDING';
    return pct >= 100 && pct <= 400 ? 'ELIGIBLE' : 'PENDING';
  });

  sync(): void {
    this.snapshot.set({ ...this.form, services: { ...this.form.services } });
  }

  stepValid(step: number): boolean {
    const f = this.form;
    if (step === 1) {
      return !!(f.firstName.trim() && f.lastName.trim() && f.dateOfBirth && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email));
    }
    if (step === 2) return !!f.householdSize && f.householdIncome !== null && f.householdIncome >= 0 && f.hasCoverage !== null;
    return !!(f.insurer && f.metalLevel && f.monthlyPremium !== null && f.monthlyPremium >= 0 && f.coverageStart);
  }

  hasServices(): boolean {
    return this.services.some((s) => this.form.services[s]);
  }

  back(): void {
    this.error.set(null);
    this.step.update((s) => Math.max(1, s - 1));
  }

  next(): void {
    this.sync();
    if (!this.stepValid(this.step())) {
      this.error.set('Completa los campos obligatorios de este paso.');
      return;
    }
    this.error.set(null);
    if (this.step() < 3) this.step.update((s) => s + 1);
    else void this.submit();
  }

  private async submit(): Promise<void> {
    if (this.submitting()) return;
    this.submitting.set(true);
    const f = this.form;
    let patient: PatientResponse | null = null;
    try {
      patient = await firstValueFrom(
        this.patientsApi.create({
          firstName: f.firstName.trim(),
          lastName: f.lastName.trim(),
          email: f.email.trim(),
          phone: f.phone.trim() || undefined,
          dateOfBirth: f.dateOfBirth,
          householdIncome: f.householdIncome ?? undefined,
          acaEligibilityStatus: this.eligibility(),
          accountStatus: 'PENDING',
        }),
      );
      const start = f.coverageStart;
      await firstValueFrom(
        this.patientsApi.createPolicy(patient.id, {
          insurer: f.insurer,
          planName: `${f.metalLevel} ACA`,
          coverageStart: start,
          coverageEnd: `${start.slice(0, 4)}-12-31`,
          premiumAmount: f.monthlyPremium ?? 0,
          status: 'PENDING',
        }),
      );
      const selected = this.services.filter((s) => f.services[s]);
      if (selected.length) {
        await firstValueFrom(
          this.claimsApi.create({
            patientId: patient.id,
            description: 'Coordinación de servicios de afiliación',
            location: f.city.trim() || undefined,
            services: selected.map((name) => ({ name })),
          }),
        );
      }
      await Promise.all([this.store.loadPatients(), this.store.loadClaims()]);
      this.created.set(patient);
      this.store.notify({ kind: 'success', text: `${patient.firstName} ${patient.lastName} afiliado correctamente.` });
    } catch (err) {
      const message = apiErrorMessage(err);
      this.error.set(patient ? `Paciente creado, pero falló un paso posterior: ${message}` : message);
      if (patient) void this.store.loadPatients();
    } finally {
      this.submitting.set(false);
    }
  }

  restart(): void {
    this.form = emptyForm();
    this.sync();
    this.created.set(null);
    this.error.set(null);
    this.step.set(1);
  }
}
