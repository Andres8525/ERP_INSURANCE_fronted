import { NAVIGATION_ITEMS } from './navigation';

describe('NAVIGATION_ITEMS', () => {
  it('solo expone los módulos del caso de estudio', () => {
    expect(NAVIGATION_ITEMS.map((item) => item.label)).toEqual([
      'Resumen',
      'Auditoría IA',
      'Siniestros',
      'Afiliaciones',
      'Clientes CRM',
      'Pacientes',
      'Optimización nube',
    ]);
  });

  it('reserva la auditoría IA y la optimización en la nube a roles con permiso de auditoría', () => {
    expect(NAVIGATION_ITEMS.filter((item) => item.requiresAudit).map((item) => item.key)).toEqual(['audit', 'cloud']);
  });
});
