import { CloudArchiveCandidate } from '../models/erp.models';

/** La optimización de nube no tiene backend en el MVP: se muestra con datos ilustrativos. */
export const CLOUD_ARCHIVE_DEMO: CloudArchiveCandidate[] = [
  { id: 'NX-001274', description: 'Archivo de póliza', documentType: 'Póliza ACA', lastActivity: 'Mar 12, 2018', sizeMb: 248, eligibility: 'archivable' },
  { id: 'NX-000981', description: 'Comunicaciones', documentType: 'Correspondencia', lastActivity: 'Ago 4, 2017', sizeMb: 86, eligibility: 'legal-review' },
];
