/**
 * Modelos exclusivos de la interfaz (no vienen del backend).
 * Los contratos HTTP están en core/api/api.models.ts.
 */
export type ArchiveEligibility = 'archivable' | 'legal-review' | 'retention-hold';

export interface CloudArchiveCandidate {
  id: string;
  description: string;
  documentType: string;
  lastActivity: string;
  sizeMb: number;
  eligibility: ArchiveEligibility;
}
