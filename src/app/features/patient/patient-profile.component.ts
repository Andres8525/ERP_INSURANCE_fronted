import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import {
  AccountStatus,
  AcaEligibilityStatus,
  PatientResponse,
  PolicyResponse,
  PolicyStatus,
  UpdatePatientRequest,
} from '@core/api/api.models';
import { PatientsApi } from '@core/api/patients.api';
import { ErpStore } from '@core/state/erp.store';
import { Fmt, apiErrorMessage } from '@core/ui/format';
import { emailError } from '@core/validation/email.validators';
import { normalizePhone, phoneError } from '@core/validation/phone.validators';
import { FieldErrorComponent } from '@shared/ui/field-error.component';

type EditField = 'firstName' | 'lastName' | 'email' | 'phone';

export function validatePatientDraft(draft: Pick<UpdatePatientRequest, EditField>): Partial<Record<EditField, string>> {
  const errors: Partial<Record<EditField, string>> = {};
  if (!draft.firstName?.trim()) errors.firstName = 'Ingresa el nombre.';
  if (!draft.lastName?.trim()) errors.lastName = 'Ingresa el apellido.';
  const email = emailError(draft.email);
  if (email) errors.email = email;
  const phone = phoneError(draft.phone);
  if (phone) errors.phone = phone;
  return errors;
}

type EditDraft = Required<Pick<UpdatePatientRequest, 'firstName' | 'lastName' | 'email' | 'phone'>> & {
  accountStatus: AccountStatus;
  acaEligibilityStatus: AcaEligibilityStatus;
};

@Component({
  selector: 'app-patient-profile',
  imports: [FormsModule, FieldErrorComponent],
  templateUrl: './patient-profile.component.html',
})
export class PatientProfileComponent {
  readonly store = inject(ErpStore);
  private readonly patientsApi = inject(PatientsApi);
  readonly fmt = Fmt;

  readonly focusPatientId = input<string | null>(null);

  readonly query = signal('');
  readonly selectedId = signal<string | null>(null);
  readonly policies = signal<PolicyResponse[]>([]);
  readonly policiesLoading = signal(false);
  readonly policiesError = signal<string | null>(null);
  readonly editing = signal(false);
  readonly editErrors = signal<Partial<Record<EditField, string>>>({});
  readonly saving = signal(false);
  draft: EditDraft | null = null;

  readonly accountStatuses: AccountStatus[] = ['ACTIVE', 'PENDING', 'INACTIVE'];
  readonly eligibilityStatuses: AcaEligibilityStatus[] = ['UNKNOWN', 'PENDING', 'ELIGIBLE', 'INELIGIBLE'];
  readonly policyStatuses: PolicyStatus[] = ['PENDING', 'ACTIVE', 'TERMINATED'];
  readonly policyBusy = signal<string | null>(null);

  readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const all = this.store.patients();
    if (!q) return all;
    return all.filter((p) => `${p.firstName} ${p.lastName} ${p.email} ${p.crmId} ${p.city ?? ''}`.toLowerCase().includes(q));
  });
  readonly selected = computed(() => this.store.patients().find((p) => p.id === this.selectedId()) ?? null);
  readonly claims = computed(() => this.store.allClaims().filter((c) => c.patient.id === this.selectedId()));
  readonly anomalies = computed(() => this.store.anomalies().filter((a) => a.patient?.id === this.selectedId()));

  constructor() {
    effect(() => {
      const focus = this.focusPatientId();
      const patients = this.store.patients();
      untracked(() => {
        const current = this.selectedId();
        if (current && patients.some((p) => p.id === current)) return;
        const target = focus && patients.some((p) => p.id === focus) ? focus : patients[0]?.id;
        if (target) this.select(target);
      });
    });
  }

  select(id: string): void {
    this.selectedId.set(id);
    this.editing.set(false);
    void this.loadPolicies(id);
  }

  private async loadPolicies(id: string): Promise<void> {
    this.policiesLoading.set(true);
    this.policiesError.set(null);
    try {
      const result = await firstValueFrom(this.patientsApi.policies(id));
      if (this.selectedId() === id) this.policies.set(result);
    } catch (error) {
      this.policies.set([]);
      this.policiesError.set(apiErrorMessage(error));
    } finally {
      this.policiesLoading.set(false);
    }
  }

  async changePolicyStatus(policy: PolicyResponse, status: PolicyStatus): Promise<void> {
    if (policy.status === status || this.policyBusy()) return;
    this.policyBusy.set(policy.id);
    await this.store.run(async () => {
      await firstValueFrom(this.patientsApi.updatePolicy(policy.patientId, policy.id, { status }));
      return `Póliza ${policy.policyNumber}: ${this.fmt.policyStatus(status).toLowerCase()}.`;
    });
    this.policyBusy.set(null);
    await this.loadPolicies(policy.patientId);
  }

  async deletePolicy(policy: PolicyResponse): Promise<void> {
    if (!confirm(`¿Eliminar la póliza ${policy.policyNumber}?`)) return;
    this.policyBusy.set(policy.id);
    await this.store.run(async () => {
      await firstValueFrom(this.patientsApi.deletePolicy(policy.patientId, policy.id));
      return `Póliza ${policy.policyNumber} eliminada.`;
    });
    this.policyBusy.set(null);
    await this.loadPolicies(policy.patientId);
  }

  startEdit(patient: PatientResponse): void {
    this.draft = {
      firstName: patient.firstName,
      lastName: patient.lastName,
      email: patient.email,
      phone: patient.phone ?? '',
      accountStatus: patient.accountStatus,
      acaEligibilityStatus: patient.acaEligibilityStatus,
    };
    this.editErrors.set({});
    this.editing.set(true);
  }

  async save(patient: PatientResponse): Promise<void> {
    if (!this.draft || this.saving()) return;
    const errors = validatePatientDraft(this.draft);
    this.editErrors.set(errors);
    if (Object.keys(errors).length) return;
    this.saving.set(true);
    const draft = this.draft;
    const ok = await this.store.run(async () => {
      await firstValueFrom(
        this.patientsApi.update(patient.id, {
          firstName: draft.firstName.trim(),
          lastName: draft.lastName.trim(),
          email: draft.email.trim(),
          phone: normalizePhone(draft.phone) ?? (draft.phone.trim() || undefined),
          accountStatus: draft.accountStatus,
          acaEligibilityStatus: draft.acaEligibilityStatus,
        }),
      );
      await this.store.loadPatients();
      return 'Paciente actualizado.';
    });
    this.saving.set(false);
    if (ok) this.editing.set(false);
  }

  async remove(patient: PatientResponse): Promise<void> {
    if (!confirm(`¿Eliminar a ${patient.firstName} ${patient.lastName}? Se eliminarán también sus pólizas.`)) return;
    const ok = await this.store.run(async () => {
      await firstValueFrom(this.patientsApi.delete(patient.id));
      await this.store.loadPatients();
      return 'Paciente eliminado.';
    });
    if (ok) {
      this.selectedId.set(null);
      const first = this.store.patients()[0];
      if (first) this.select(first.id);
    }
  }
}
