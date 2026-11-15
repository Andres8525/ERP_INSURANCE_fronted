export type Uuid = string;
export type IsoInstant = string;
export type IsoDate = string;

export type UserRole = 'ADMIN' | 'AGENT' | 'AUDITOR';
export type AccountStatus = 'ACTIVE' | 'PENDING' | 'INACTIVE';
export type AcaEligibilityStatus = 'UNKNOWN' | 'PENDING' | 'ELIGIBLE' | 'INELIGIBLE';
export type PolicyStatus = 'PENDING' | 'ACTIVE' | 'TERMINATED';
export type ClaimStatus = 'OPEN' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';
export type ClaimPriority = 'NORMAL' | 'HIGH';
export type AnomalyType = 'POLICY_OVERLAP' | 'DUPLICATE' | 'OBSOLETE_FILE' | 'OTHER';

export type AnomalySeverity = 'RED' | 'YELLOW';
export type AnomalyResolutionStatus = 'OPEN' | 'RESOLVED' | 'ARCHIVED';
export type AffectedRecordType = 'PATIENT' | 'POLICY' | 'CLAIM';
export type BatchResolutionAction = 'ARCHIVAR_DEFINITIVO' | 'AUTOCORREGIR';

export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;

  number: number;
  size: number;
  first: boolean;
  last: boolean;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export type RegisterRequest = LoginRequest;

export interface TokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresAt: IsoInstant;
  email: string;
  role: UserRole;
}

export interface SessionResponse {
  email: string;
  role: UserRole;
  expiresAt: IsoInstant;
}

export interface CreatePatientRequest {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  city?: string;
  dateOfBirth: string;
  householdIncome?: number;
  acaEligibilityStatus?: AcaEligibilityStatus;
  accountStatus?: AccountStatus;
}

export type UpdatePatientRequest = Partial<CreatePatientRequest>;

export interface PatientResponse {
  id: Uuid;
  crmId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  city?: string;
  dateOfBirth: string;
  householdIncome?: number;
  acaEligibilityStatus: AcaEligibilityStatus;
  accountStatus: AccountStatus;
  createdAt: IsoInstant;
}

export interface ClientPlan {
  policyId: Uuid;
  policyNumber: string;
  insurer: string;
  planName?: string;
  premiumAmount: number;
  zeroPremium: boolean;
  coverageStart: IsoDate;
  coverageEnd: IsoDate;
  status: PolicyStatus;
}

export interface ClientSummary {
  id: Uuid;
  crmId: string;
  fullName: string;
  email: string;
  phone?: string;
  city?: string;
  age?: number;
  accountStatus: AccountStatus;
  acaEligibilityStatus: AcaEligibilityStatus;
  currentPlan?: ClientPlan;
  policies: number;
  description: string;
}

export interface CreatePolicyRequest {
  policyNumber?: string;
  insurer: string;
  planName?: string;
  coverageStart: IsoDate;
  coverageEnd: IsoDate;
  premiumAmount: number;
  status?: PolicyStatus;
}

export type UpdatePolicyRequest = Partial<Omit<CreatePolicyRequest, 'policyNumber'>>;

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

export type ClaimPipeline = Record<ClaimStatus, ClaimResponse[]>;

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

  confidence?: number;
  fieldLabel?: string;
  currentValue?: string;
  conflictingValue?: string;
  evidence?: string;
  suggestedCorrectionField?: string;
  suggestedCorrectionValue?: string;

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

export type EngineMode = 'REMOTE' | 'IN_PROCESS';

export interface ScanResponse {
  analyzedRecords: number;
  findings: number;
  created: number;
  alreadyKnown: number;
  engineMode: EngineMode;
  engineVersion: string;
  appliedRules: string[];
  correlationId: string;
  durationMs: number;
}

export interface AuditSummaryResponse {
  open: number;
  critical: number;
  review: number;
  resolvedThisMonth: number;
}

export type AiUnavailableReason = 'NOT_CONFIGURED' | 'UNAUTHORIZED' | 'NO_CREDITS' | 'RATE_LIMITED' | 'TIMEOUT' | 'PROVIDER_ERROR';

export interface AiStatusResponse {
  enabled: boolean;
  provider: string;
  model: string;
}

export interface AiInsightResponse {
  content: string;
  provider: string;
  model: string;
  analyzedAnomalies: number;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  generatedAt: string;
  cached: boolean;
}

export interface ProblemDetail {
  type?: string;
  title?: string;
  status: number;
  detail?: string;
  instance?: string;
  reason?: AiUnavailableReason;

  errors?: Record<string, string>;
}
