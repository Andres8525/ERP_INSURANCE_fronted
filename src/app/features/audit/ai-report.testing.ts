import { AiReport } from '@core/api/api.models';

export const REPORT: AiReport = {
  summary: 'La bandeja tiene 7 anomalías abiertas, 3 críticas.',
  impact: 'Riesgo de cobros duplicados.',
  riskLevel: 'ALTO',
  priorities: [
    { title: 'Pólizas solapadas', severity: 'Crítica', recordType: 'Póliza', count: 2, risk: 'Doble cobertura.', action: 'Cancelar la más reciente.' },
    { title: 'Teléfono con formato inválido', severity: 'Revisión', recordType: 'Paciente', count: 1 },
  ],
  actions: [
    { title: 'Consolidar pólizas', owner: 'Afiliación', detail: 'Confirmar con la aseguradora.' },
    { title: 'Normalizar teléfonos' },
  ],
  prevention: ['Validar fechas al emitir.'],
};
