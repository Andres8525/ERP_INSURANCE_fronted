export type ViewKey = 'overview' | 'audit' | 'claims' | 'enrollment' | 'clients' | 'patient' | 'cloud' | 'workers';

export interface NavigationItem {
  key: ViewKey;
  label: string;
  icon: 'grid' | 'scan' | 'file' | 'users' | 'card' | 'user' | 'cloud' | 'cpu';
  section: 'OPERACIONES' | 'GESTIÓN' | 'SISTEMA';
  requiresAudit?: boolean;
}

export const NAVIGATION_ITEMS: NavigationItem[] = [
  { key: 'overview', label: 'Resumen', icon: 'grid', section: 'OPERACIONES' },
  { key: 'audit', label: 'Auditoría IA', icon: 'scan', section: 'OPERACIONES', requiresAudit: true },
  { key: 'claims', label: 'Siniestros', icon: 'file', section: 'OPERACIONES' },
  { key: 'enrollment', label: 'Afiliaciones', icon: 'users', section: 'GESTIÓN' },
  { key: 'clients', label: 'Clientes CRM', icon: 'card', section: 'GESTIÓN' },
  { key: 'patient', label: 'Pacientes', icon: 'user', section: 'GESTIÓN' },
  { key: 'cloud', label: 'Optimización nube', icon: 'cloud', section: 'SISTEMA' },
  { key: 'workers', label: 'Monitor de workers', icon: 'cpu', section: 'SISTEMA' },
];
