/**
 * Contrato HTTP con el backend Spring Boot (backend/src/main/java/com/erp/insurance).
 * Cada interfaz refleja 1:1 un record Java; si cambias uno, cambia el otro.
 *
 * El backend serializa con `default-property-inclusion: non_null`, por lo que los campos
 * que pueden ser null en Java llegan AUSENTES en el JSON: aquí se declaran opcionales (`?`).
 * Fechas: Instant -> ISO-8601 string (UTC); LocalDate -> 'YYYY-MM-DD'; BigDecimal -> number.
 */

export type Uuid = string;
export type IsoInstant = string;
export type IsoDate = string;

// ---- DomainEnums.java -------------------------------------------------------
export type UserRole = 'ADMIN' | 'AGENT' | 'AUDITOR';
export type AccountStatus = 'ACTIVE' | 'PENDING' | 'INACTIVE';
export type AcaEligibilityStatus = 'UNKNOWN' | 'PENDING' | 'ELIGIBLE' | 'INELIGIBLE';
export type PolicyStatus = 'PENDING' | 'ACTIVE' | 'TERMINATED';
export type ClaimStatus = 'OPEN' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';
export type ClaimPriority = 'NORMAL' | 'HIGH';
export type AnomalyType = 'POLICY_OVERLAP' | 'DUPLICATE' | 'OBSOLETE_FILE' | 'OTHER';
/** RED = Crítico, YELLOW = Revisión. */
export type AnomalySeverity = 'RED' | 'YELLOW';
export type AnomalyResolutionStatus = 'OPEN' | 'RESOLVED' | 'ARCHIVED';
export type AffectedRecordType = 'PATIENT' | 'POLICY' | 'CLAIM';
export type BatchResolutionAction = 'ARCHIVAR_DEFINITIVO' | 'AUTOCORREGIR';

// ---- common/PageResponse.java -----------------------------------------------
export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  /** Página actual, empieza en 0. */
  number: number;
  size: number;
  first: boolean;
  last: boolean;
}

// ---- auth/AuthController.java -----------------------------------------------
export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresAt: IsoInstant;
  email: string;
  role: UserRole;
}

// ---- patients/PatientDtos.java ----------------------------------------------
export interface CreatePatientRequest {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  /** 'YYYY-MM-DD' */
  dateOfBirth: string;
  householdIncome?: number;
  acaEligibilityStatus?: AcaEligibilityStatus;
  accountStatus?: AccountStatus;
}

/** PUT/PATCH parcial: solo se modifican los campos enviados. */
export type UpdatePatientRequest = Partial<CreatePatientRequest>;

export interface PatientResponse {
  id: Uuid;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  dateOfBirth: string;
  householdIncome?: number;
  acaEligibilityStatus: AcaEligibilityStatus;
  accountStatus: AccountStatus;
  createdAt: IsoInstant;
}

// ---- policies/PolicyDtos.java -----------------------------------------------
export interface CreatePolicyRequest {
  policyNumber?: string;
  insurer: string;
  planName?: string;
  coverageStart: IsoDate;
  coverageEnd: IsoDate;
  premiumAmount: number;
  status?: PolicyStatus;
}

export interface PolicyResponse {
  id: Uuid;
  patientId: Uuid;
  policyNumber: string;
  insurer: string;
  planName?: string;
  coverageStart: IsoDate;
  coverageEnd: IsoDate;
  premiumAmount: number;
  status: PolicyStatus;
  hasAnomalies: boolean;
  createdAt: IsoInstant;
}

// ---- claims/ClaimDtos.java --------------------------------------------------
export interface ClaimServiceRequest {
  name: string;
  details?: string;
  scheduledAt?: IsoInstant;
}

export interface CreateClaimRequest {
  patientId: Uuid;
  description: string;
  status?: ClaimStatus;
  priority?: ClaimPriority;
  amount?: number;
  location?: string;
  services?: ClaimServiceRequest[];
}

export interface UpdateClaimRequest {
  description?: string;
  status?: ClaimStatus;
  priority?: ClaimPriority;
  amount?: number;
  location?: string;
  note?: string;
}

export interface ChangeStatusRequest {
  status: ClaimStatus;
  note?: string;
}

export interface PatientBrief {
  id: Uuid;
  firstName: string;
  lastName: string;
}

export interface ClaimServiceBrief {
  id: Uuid;
  name: string;
  details?: string;
  scheduledAt?: IsoInstant;
}

export interface ClaimHistoryEntry {
  fromStatus?: ClaimStatus;
  toStatus: ClaimStatus;
  note?: string;
  changedAt: IsoInstant;
}

export interface ClaimResponse {
  id: Uuid;
  claimNumber: string;
  description: string;
  status: ClaimStatus;
  priority: ClaimPriority;
  amount?: number;
  location?: string;
  patient: PatientBrief;
  services: ClaimServiceBrief[];
  history: ClaimHistoryEntry[];
  createdAt: IsoInstant;
  updatedAt: IsoInstant;
}

/** GET /api/claims/pipeline: siempre incluye las cuatro columnas. */
export type ClaimPipeline = Record<ClaimStatus, ClaimResponse[]>;

// ---- audit/AuditDtos.java ---------------------------------------------------
export interface AnomalyPatient {
  id: Uuid;
  fullName: string;
}

export interface AnomalyResponse {
  id: Uuid;
  type: AnomalyType;
  severity: AnomalySeverity;
  title?: string;
  description: string;
  resolutionStatus: AnomalyResolutionStatus;
  affectedRecordType: AffectedRecordType;
  affectedRecordId: Uuid;
  patient?: AnomalyPatient;
  source?: string;
  /** Confianza del modelo IA, 0-100. */
  confidence?: number;
  fieldLabel?: string;
  currentValue?: string;
  conflictingValue?: string;
  evidence?: string;
  suggestedCorrectionField?: string;
  suggestedCorrectionValue?: string;
  /** true si el backend puede aplicar la sugerencia con AUTOCORREGIR. */
  autoCorrectable: boolean;
  createdAt: IsoInstant;
}

export interface AnomalyQuery {
  page?: number;
  size?: number;
  severity?: AnomalySeverity;
  resolutionStatus?: AnomalyResolutionStatus;
  type?: AnomalyType;
}

export interface ResolveBatchRequest {
  ids: Uuid[];
  action: BatchResolutionAction;
}

export interface ResolveBatchResponse {
  processed: number;
  action: BatchResolutionAction;
  ids: Uuid[];
}

export interface AuditSummaryResponse {
  open: number;
  critical: number;
  review: number;
  resolvedThisMonth: number;
}

/** Cuerpo de error RFC 7807 (spring.mvc.problemdetails.enabled=true). */
export interface ProblemDetail {
  type?: string;
  title?: string;
  status: number;
  detail?: string;
  instance?: string;
}
