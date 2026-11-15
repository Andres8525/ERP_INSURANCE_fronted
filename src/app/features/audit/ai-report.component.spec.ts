import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AiReport } from '@core/api/api.models';
import { AiReportComponent } from './ai-report.component';

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

describe('AiReportComponent', () => {
  let fixture: ComponentFixture<AiReportComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AiReportComponent] }).compileComponents();
    fixture = TestBed.createComponent(AiReportComponent);
  });

  function render(report: AiReport, compact = false): HTMLElement {
    fixture.componentRef.setInput('report', report);
    fixture.componentRef.setInput('compact', compact);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  it('muestra resumen, riesgo, prioridades numeradas, acciones con responsable y prevención', () => {
    const element = render(REPORT);

    expect(element.querySelector('[data-testid="ai-summary"]')?.textContent).toContain('7 anomalías abiertas');
    expect(element.querySelector('[data-testid="ai-risk"]')?.textContent?.trim()).toBe('Riesgo alto');
    expect(element.textContent).toContain('Por qué importa');

    const priorities = element.querySelectorAll('[data-testid="ai-priority"]');
    expect(priorities).toHaveLength(2);
    expect(priorities[0].textContent).toContain('Pólizas solapadas');
    expect(priorities[0].textContent).toContain('Póliza · 2 casos');
    expect(priorities[0].textContent).toContain('Cancelar la más reciente.');
    expect(priorities[1].textContent).toContain('Paciente · 1 caso');

    const actions = element.querySelectorAll('[data-testid="ai-action"]');
    expect(actions).toHaveLength(2);
    expect(actions[0].textContent).toContain('Afiliación');
    expect(element.textContent).toContain('Acciones recomendadas');
    expect(element.querySelectorAll('[data-testid="ai-prevention"]')).toHaveLength(1);
  });

  it('en modo compacto titula los pasos como "Cómo corregirlo" y omite secciones vacías', () => {
    const element = render({ ...REPORT, impact: undefined, priorities: [], prevention: [], riskLevel: 'BAJO' }, true);

    expect(element.textContent).toContain('Cómo corregirlo');
    expect(element.textContent).not.toContain('Prioridades');
    expect(element.textContent).not.toContain('Por qué importa');
    expect(element.textContent).not.toContain('Prevención');
    expect(element.querySelector('[data-testid="ai-risk"]')?.textContent?.trim()).toBe('Riesgo bajo');
  });
});
