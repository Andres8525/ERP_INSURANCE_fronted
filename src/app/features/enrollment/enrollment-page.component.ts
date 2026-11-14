import { HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { AcaEligibilityStatus, PatientResponse, ProblemDetail } from '@core/api/api.models';
import { ClaimsApi } from '@core/api/claims.api';
import { PatientsApi } from '@core/api/patients.api';
import { ErpStore } from '@core/state/erp.store';
import { Fmt, apiErrorMessage } from '@core/ui/format';
import { birthDateError, coverageStartError } from '@core/validation/date.validators';
import { emailError, suggestEmail } from '@core/validation/email.validators';
import { normalizePhone, phoneError } from '@core/validation/phone.validators';
import { FieldErrorComponent } from '@shared/ui/field-error.component';
import { ViewKey } from '@core/layout/navigation';

export interface EnrollmentForm {
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

export type EnrollmentField =
  | 'firstName'
  | 'lastName'
  | 'dateOfBirth'
  | 'email'
  | 'phone'
  | 'householdSize'
  | 'householdIncome'
  | 'hasCoverage'
  | 'insurer'
  | 'metalLevel'
  | 'monthlyPremium'
  | 'coverageStart';

export const STEP_FIELDS: Record<number, readonly EnrollmentField[]> = {
  1: ['firstName', 'lastName', 'dateOfBirth', 'email', 'phone'],
  2: ['householdSize', 'householdIncome', 'hasCoverage'],
  3: ['insurer', 'metalLevel', 'monthlyPremium', 'coverageStart'],
};

const FIELD_LABELS: Record<EnrollmentField, string> = {
  firstName: 'Nombre legal',
  lastName: 'Apellido legal',
  dateOfBirth: 'Fecha de nacimiento',
  email: 'Correo electrónico',
  phone: 'Teléfono móvil',
  householdSize: 'Tamaño del hogar',
  householdIncome: 'Ingreso anual',
  hasCoverage: 'Cobertura actual',
  insurer: 'Aseguradora',
  metalLevel: 'Nivel del plan',
  monthlyPremium: 'Prima mensual',
  coverageStart: 'Inicio de cobertura',
};

const MAX_HOUSEHOLD_INCOME = 99_999_999.99;
const MAX_MONTHLY_PREMIUM = 10_000;

function requiredName(value: string, label: string): string | null {
  const text = value.trim();
  if (!text) return `Ingresa el ${label.toLowerCase()}.`;
  return text.length > 100 ? 'Máximo 100 caracteres.' : null;
}

const SERVER_MESSAGES: Partial<Record<EnrollmentField, string>> = {
  email: 'El servidor rechazó el correo: usa un dominio completo, por ejemplo nombre@correo.com.',
  phone: 'El servidor rechazó el teléfono: usa solo números, espacios, paréntesis o guiones.',
  dateOfBirth: 'El servidor rechazó la fecha de nacimiento.',
};

export function serverFieldErrors(error: unknown): Partial<Record<EnrollmentField, string>> {
  if (!(error instanceof HttpErrorResponse) || error.status !== 400) return {};
  const problem = error.error as Partial<ProblemDetail> | null;
  const result: Partial<Record<EnrollmentField, string>> = {};
  for (const [field, message] of Object.entries(problem?.errors ?? {})) {
    if (field in FIELD_LABELS) {
      const key = field as EnrollmentField;
      result[key] = SERVER_MESSAGES[key] ?? `Valor rechazado por el servidor (${message}).`;
    }
  }
  return result;
}

export function validateEnrollment(f: EnrollmentForm, today = new Date()): Record<EnrollmentField, string | null> {
  return {
    firstName: requiredName(f.firstName, 'nombre'),
    lastName: requiredName(f.lastName, 'apellido'),
    dateOfBirth: birthDateError(f.dateOfBirth, today),
    email: emailError(f.email),
    phone: phoneError(f.phone),
    householdSize: f.householdSize ? null : 'Selecciona el tamaño del hogar.',
    householdIncome:
      f.householdIncome === null || f.householdIncome === undefined || Number.isNaN(f.householdIncome)
        ? 'Ingresa el ingreso anual del hogar.'
        : f.householdIncome < 0
          ? 'El ingreso no puede ser negativo.'
          : f.householdIncome > MAX_HOUSEHOLD_INCOME
            ? 'El ingreso supera el máximo permitido.'
            : null,
    hasCoverage: f.hasCoverage === null ? 'Indica si tiene cobertura médica actualmente.' : null,
    insurer: f.insurer ? null : 'Selecciona la aseguradora.',
    metalLevel: f.metalLevel ? null : 'Selecciona el nivel del plan.',
    monthlyPremium:
      f.monthlyPremium === null || f.monthlyPremium === undefined || Number.isNaN(f.monthlyPremium)
        ? 'Ingresa la prima mensual.'
        : f.monthlyPremium <= 0
          ? 'La prima debe ser mayor que 0.'
          : f.monthlyPremium > MAX_MONTHLY_PREMIUM
            ? 'La prima mensual no puede superar 10.000 USD.'
            : null,
    coverageStart: coverageStartError(f.coverageStart, today),
  };
}

function localIsoDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function firstOfNextMonth(): string {
  const now = new Date();
  return localIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 1));
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
  imports: [FormsModule, FieldErrorComponent],
  templateUrl: './enrollment-page.component.html',
})
export class EnrollmentPageComponent {
  private readonly patientsApi = inject(PatientsApi);
  private readonly claimsApi = inject(ClaimsApi);
  private readonly store = inject(ErpStore);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  readonly fmt = Fmt;

  readonly patientCreated = output<string>();
  readonly viewChange = output<ViewKey>();

  readonly steps = [1, 2, 3] as const;
  readonly stepTitles = STEP_TITLES;
  readonly services = LINKED_SERVICES;
  readonly insurers = ['Ambetter', 'Oscar Health', 'Florida Blue', 'Molina Healthcare', 'Aetna CVS Health'];
  readonly metalLevels = ['Bronze', 'Silver', 'Gold', 'Platinum'];
  readonly today = localIsoDate(new Date());

  readonly step = signal(1);
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);
  readonly created = signal<PatientResponse | null>(null);
  /** Copia en señal del formulario para que los `computed` reaccionen (zoneless). */
  private readonly snapshot = signal<EnrollmentForm>(emptyForm());
  form: EnrollmentForm = emptyForm();
  private readonly attemptedSteps = signal<ReadonlySet<number>>(new Set());
  private readonly touched = signal<ReadonlySet<EnrollmentField>>(new Set());

  private readonly serverErrors = signal<Partial<Record<EnrollmentField, string>>>({});

  readonly fieldErrors = computed(() => {
    const local = validateEnrollment(this.snapshot());
    const server = this.serverErrors();
    for (const field of Object.keys(server) as EnrollmentField[]) local[field] ??= server[field] ?? null;
    return local;
  });
  readonly emailSuggestion = computed(() => suggestEmail(this.snapshot().email));

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
    if (Object.keys(this.serverErrors()).length) this.serverErrors.set({});
  }

  invalidFields(step: number): EnrollmentField[] {
    const errors = this.fieldErrors();
    return STEP_FIELDS[step].filter((field) => errors[field]);
  }

  stepValid(step: number): boolean {
    return this.invalidFields(step).length === 0;
  }

  errorFor(field: EnrollmentField): string | null {
    const step = Number(Object.keys(STEP_FIELDS).find((key) => STEP_FIELDS[Number(key)].includes(field)));
    return this.attemptedSteps().has(step) || this.touched().has(field) ? this.fieldErrors()[field] : null;
  }

  markTouched(event: FocusEvent): void {
    const name = (event.target as HTMLElement | null)?.getAttribute('name') as EnrollmentField | null;
    if (!name || !(name in FIELD_LABELS)) return;
    this.touched.update((fields) => new Set(fields).add(name));
    if (name === 'phone') {
      const formatted = normalizePhone(this.form.phone);
      if (formatted && formatted !== this.form.phone) {
        this.form.phone = formatted;
        this.sync();
      }
    }
  }

  applyEmailSuggestion(suggestion: string): void {
    this.form.email = suggestion;
    this.sync();
    if (this.error()?.startsWith(FIELD_LABELS.email)) this.error.set(null);
  }

  private focusField(field: EnrollmentField): void {
    setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>(`[name="${field}"]`)?.focus());
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
    const invalid = this.invalidFields(this.step());
    if (invalid.length) {
      this.attemptedSteps.update((steps) => new Set(steps).add(this.step()));
      const [first] = invalid;
      this.error.set(
        invalid.length === 1
          ? `${FIELD_LABELS[first]}: ${this.fieldErrors()[first]}`
          : `Revisa los ${invalid.length} campos marcados en rojo.`,
      );
      this.focusField(first);
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
          phone: normalizePhone(f.phone) ?? (f.phone.trim() || undefined),
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
      const rejected = patient ? {} : serverFieldErrors(err);
      const fields = Object.keys(rejected) as EnrollmentField[];
      if (fields.length) {
        this.serverErrors.set(rejected);
        const step = Number(Object.keys(STEP_FIELDS).find((key) => STEP_FIELDS[Number(key)].includes(fields[0])));
        this.attemptedSteps.update((steps) => new Set(steps).add(step));
        this.step.set(step);
        this.error.set('El servidor rechazó algunos datos. Revisa los campos marcados.');
        this.focusField(fields[0]);
        return;
      }
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
    this.attemptedSteps.set(new Set());
    this.touched.set(new Set());
    this.serverErrors.set({});
    this.step.set(1);
  }
}
