/**
 * Modelos exclusivos de la interfaz (no vienen del backend).
 * Los contratos HTTP están en core/api/api.models.ts.
 */
export type ViewKey = 'overview' | 'audit' | 'claims' | 'enrollment' | 'patient' | 'cloud';
export type ArchiveEligibility = 'archivable' | 'legal-review' | 'retention-hold';

export interface NavigationItem {
  key: ViewKey;
  label: string;
  icon: 'grid' | 'scan' | 'file' | 'users' | 'user' | 'cloud';
  section: 'OPERACIONES' | 'GESTIÓN' | 'SISTEMA';
  /** Solo visible para roles con permiso de auditoría. */
  requiresAudit?: boolean;
}

export interface CloudArchiveCandidate {
  id: string;
  description: string;
  documentType: string;
  lastActivity: string;
  sizeMb: number;
  eligibility: ArchiveEligibility;
}
