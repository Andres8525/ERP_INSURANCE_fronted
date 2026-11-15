import { environment } from '@env/environment';

export type ClinicalRole = 'MEDICO' | 'ENFERMERO' | 'RECEPCION';
export type SedeId = 'SEDE-MIA' | 'SEDE-ORL' | 'SEDE-TPA';
export const SEDES: SedeId[] = ['SEDE-MIA', 'SEDE-ORL', 'SEDE-TPA'];

export type LabJobKind = 'LAB_RESULTS' | 'RIPS';

export interface LabJobStatus {
  jobId: string;
  kind: LabJobKind;
  state: 'QUEUED' | 'PROCESSING' | 'COMPLETED';
  progress: number;
  stage: string;
  etaSeconds: number;
  polls: number;
  notModified: number;
  recommendedIntervalMs: number;
  result?: { summary: string; items: string[] };
}

export type AlarmLevel = 'NORMAL' | 'WARNING' | 'CRITICAL';

export interface VitalSample {
  bedId: string;
  sedeId: string;
  patientLabel: string;
  tick: number;
  takenAt: string;
  heartRate: number;
  spo2: number;
  systolic: number;
  diastolic: number;
  respRate: number;
  temperature: number;
  alarm: AlarmLevel;
  alarmReasons: string[];
}

export interface PharmacyNotice {
  noticeId: string;
  bedId: string;
  sedeId: string;
  medication: string;
  status: 'DISPENSADO' | 'EN_CAMINO' | 'SIN_STOCK';
  issuedAt: string;
}

export interface HubUser {
  userId: string;
  email: string;
  clinicalRole: ClinicalRole;
  sedeId: SedeId;
}

export interface FanOutReport {
  recipients: number;
  delivered: number;
  skippedClosed: number;
  skippedSlow: number;
  failed: number;
  batches: number;
  bytes: number;
  durationMs: number;
}

export type RecordField = 'motivoConsulta' | 'diagnostico' | 'evolucion' | 'plan';

export interface ClinicalRecord {
  recordId: string;
  version: number;
  fields: Record<RecordField, string>;
  updatedAt: string;
  updatedBy: string | null;
}

export interface RecordLock {
  recordId: string;
  userId: string;
  email: string;
  connectionId: string;
  acquiredAt: number;
  expiresAt: number;
}

export interface HubEvent {
  type: string;
  originInstance?: string;
  deliveredBy?: string;
  [key: string]: unknown;
}

export interface HubWelcome {
  connectionId: string;
  instanceId: string;
  principal: HubUser;
  backplane: { kind: 'redis' | 'memory'; fallbackReason: string | null };
  heartbeatMs: number;
}

export interface RealtimeMetrics {
  instanceId: string;
  uptimeSeconds: number;
  backplane: { kind: string; healthy: boolean; fallbackReason: string | null };
  websocket: {
    connections: number;
    users: number;
    rooms: number;
    virtualTerminals: number;
    messagesIn: number;
    rateLimited: number;
    heartbeatTerminated: number;
    lastFanOut: (FanOutReport & { event: string; at: string }) | null;
  };
  sse: { clients: number; eventsPublished: number; eventsDelivered: number; eventsDropped: number };
  polling: { activeJobs: number; recommendedIntervalMs: number };
  eventLoop: { meanMs: number; p99Ms: number; maxMs: number };
  memory: { rssMb: number; heapUsedMb: number };
}

export function realtimeHttpUrl(path: string): string {
  return `${environment.realtimeUrl}${path}`;
}

export function realtimeWsUrl(path: string, query: Record<string, string> = {}, location: Pick<Location, 'protocol' | 'host'> = window.location): string {
  const base = environment.realtimeUrl
    ? environment.realtimeUrl.replace(/^http/, 'ws')
    : `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
  const search = new URLSearchParams(query).toString();
  return `${base}${path}${search ? `?${search}` : ''}`;
}

export function userIdFromToken(token: string | null): string | null {
  if (!token) return null;
  try {
    const payload = token.split('.')[1] ?? '';
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return (JSON.parse(json) as { sub?: string }).sub ?? null;
  } catch {
    return null;
  }
}
