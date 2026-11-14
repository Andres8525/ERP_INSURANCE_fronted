import { HttpErrorResponse } from '@angular/common/http';
import { environment } from '@env/environment';
import {
  AccountStatus,
  AcaEligibilityStatus,
  AnomalySeverity,
  AnomalyType,
  ClaimStatus,
  PolicyStatus,
  ProblemDetail,
  UserRole,
} from '../api/api.models';

const SEVERITY: Record<AnomalySeverity, string> = { RED: 'Crítica', YELLOW: 'Revisión' };
const ANOMALY_TYPE: Record<AnomalyType, string> = {
  POLICY_OVERLAP: 'Pólizas solapadas',
  DUPLICATE: 'Cliente duplicado',
  OBSOLETE_FILE: 'Archivo obsoleto',
  OTHER: 'Inconsistencia de datos',
};
const CLAIM_STATUS: Record<ClaimStatus, string> = {
  OPEN: 'Abierto',
  IN_REVIEW: 'En revisión',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
};
const ACCOUNT_STATUS: Record<AccountStatus, string> = {
  ACTIVE: 'Activo',
  PENDING: 'Pendiente',
  INACTIVE: 'Inactivo',
};
const ELIGIBILITY: Record<AcaEligibilityStatus, string> = {
  UNKNOWN: 'Sin evaluar',
  PENDING: 'En verificación',
  ELIGIBLE: 'Elegible',
  INELIGIBLE: 'No elegible',
};
const POLICY_STATUS: Record<PolicyStatus, string> = {
  PENDING: 'Pendiente',
  ACTIVE: 'Vigente',
  TERMINATED: 'Terminada',
};
const ROLE: Record<UserRole, string> = { ADMIN: 'Administrador', AUDITOR: 'Auditor', AGENT: 'Agente' };

const FIELD_LABELS: Record<string, string> = {
  firstName: 'Nombre',
  lastName: 'Apellido',
  email: 'Correo electrónico',
  phone: 'Teléfono',
  dateOfBirth: 'Fecha de nacimiento',
  householdIncome: 'Ingreso del hogar',
  password: 'Contraseña',
  insurer: 'Aseguradora',
  planName: 'Plan',
  coverageStart: 'Inicio de cobertura',
  coverageEnd: 'Fin de cobertura',
  premiumAmount: 'Prima mensual',
  description: 'Descripción',
  location: 'Ubicación',
  services: 'Servicios',
  ids: 'Selección',
  action: 'Acción',
  status: 'Estado',
};

const MESSAGE_TRANSLATIONS: [RegExp, string][] = [
  [/^must not be (blank|null|empty)$/, 'es obligatorio'],
  [/^must be a valid email address.*$/, 'debe ser un correo con dominio, por ejemplo nombre@correo.com'],
  [/^must be a well-formed email address$/, 'debe ser un correo válido'],
  [/^must contain only digits.*$/, 'solo admite números, espacios, paréntesis o guiones'],
  [/^size must be between (\d+) and (\d+)$/, 'debe tener entre $1 y $2 caracteres'],
  [/^must be greater than or equal to (.+)$/, 'debe ser mayor o igual que $1'],
  [/^must match ".*"$/, 'tiene un formato inválido'],
];

export function fieldLabel(field: string): string {
  return FIELD_LABELS[field] ?? field;
}

export function translateValidationMessage(message: string): string {
  for (const [pattern, replacement] of MESSAGE_TRANSLATIONS) {
    if (pattern.test(message)) return message.replace(pattern, replacement);
  }
  return message;
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const time = new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' });
const shortDate = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' });
const longDate = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short', year: 'numeric' });

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export const Fmt = {
  severity: (value: AnomalySeverity) => SEVERITY[value],
  anomalyType: (value: AnomalyType) => ANOMALY_TYPE[value],
  claimStatus: (value: ClaimStatus) => CLAIM_STATUS[value],
  accountStatus: (value: AccountStatus) => ACCOUNT_STATUS[value],
  eligibility: (value: AcaEligibilityStatus) => ELIGIBILITY[value],
  policyStatus: (value: PolicyStatus) => POLICY_STATUS[value],
  role: (value: UserRole | null) => (value ? ROLE[value] : ''),

  money: (value: number | undefined | null) => (value === undefined || value === null ? '—' : money.format(value)),

  initials(name: string | undefined): string {
    if (!name) return '··';
    const parts = name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '')).toUpperCase();
  },

  memberId: (uuid: string | undefined) => (uuid ? `NX-${uuid.slice(0, 8).toUpperCase()}` : '—'),

  relative(iso: string | undefined): string {
    if (!iso) return '—';
    const date = new Date(iso);
    const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
    const hour = time.format(date);
    if (days === 0) return `Hoy, ${hour}`;
    if (days === 1) return `Ayer, ${hour}`;
    return `${shortDate.format(date)}, ${hour}`;
  },

  date(value: string | undefined): string {
    if (!value) return '—';
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
    return longDate.format(date);
  },
};

export function apiErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0 || error.status === 502 || error.status === 503 || error.status === 504) {
      return `No se pudo conectar con el backend (${environment.apiUrl}). Verifica que la API esté en ejecución.`;
    }
    if (error.status === 401) return 'Sesión expirada o credenciales inválidas.';
    if (error.status === 403) return 'Tu rol no tiene permiso para esta acción.';
    const problem = error.error as Partial<ProblemDetail> | null;
    if (problem && typeof problem === 'object') {
      const fields = Object.entries(problem.errors ?? {}).map(
        ([field, message]) => `${fieldLabel(field)} ${translateValidationMessage(message)}`,
      );
      if (fields.length) return `${problem.detail ?? 'Datos inválidos'} — ${fields.join('; ')}`;
      if (problem.detail) return problem.detail;
    }
    return `Error ${error.status} al comunicarse con el backend.`;
  }
  return 'Error inesperado.';
}
