import { CloudArchiveCandidate, NavigationItem } from '../models/erp.models';

export const NAVIGATION_ITEMS: NavigationItem[] = [
  { key: 'overview', label: 'Resumen', icon: 'grid', section: 'OPERACIONES' },
  { key: 'audit', label: 'Auditoría IA', icon: 'scan', section: 'OPERACIONES', requiresAudit: true },
  { key: 'claims', label: 'Siniestros', icon: 'file', section: 'OPERACIONES' },
  { key: 'enrollment', label: 'Afiliaciones', icon: 'users', section: 'GESTIÓN' },
  { key: 'patient', label: 'Pacientes', icon: 'user', section: 'GESTIÓN' },
  { key: 'cloud', label: 'Optimización nube', icon: 'cloud', section: 'SISTEMA' },
];

/** La optimización de nube no tiene backend en el MVP: se muestra con datos ilustrativos. */
export const CLOUD_ARCHIVE_DEMO: CloudArchiveCandidate[] = [
  { id: 'NX-001274', description: 'Archivo de póliza', documentType: 'Póliza ACA', lastActivity: 'Mar 12, 2018', sizeMb: 248, eligibility: 'archivable' },
  { id: 'NX-000981', description: 'Comunicaciones', documentType: 'Correspondencia', lastActivity: 'Ago 4, 2017', sizeMb: 86, eligibility: 'legal-review' },
];
