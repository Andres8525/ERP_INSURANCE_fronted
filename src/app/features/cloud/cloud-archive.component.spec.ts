import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RetentionProfile } from '@core/api/api.models';
import { environment } from '@env/environment';
import { CloudArchiveComponent, formatInactivity, formatUsd } from './cloud-archive.component';

const API = environment.apiUrl;
const tick = () => new Promise((resolve) => setTimeout(resolve));

const PROFILE: RetentionProfile = {
  summary: {
    profiled: 35, keep: 24, archive: 3, delete: 4, legalHold: 4, storageGb: 2.93, archiveGb: 0.16, deleteGb: 0.21,
    monthlyCostUsd: 0.0674, optimizedMonthlyCostUsd: 0.0596, monthlySavingsUsd: 0.0078, savingsPercent: 11.54,
    annualSavingsPer10kRecordsUsd: 26.67,
  },
  rules: { archiveAfterMonths: 12, retentionYears: 7, hotUsdPerGbMonth: 0.023, archiveUsdPerGbMonth: 0.004 },
  categories: [
    { category: 'POLICY', label: 'Pólizas', records: 17, sizeMb: 765, keep: 9, archive: 2, delete: 3, legalHold: 3 },
    { category: 'CLAIM', label: 'Siniestros', records: 9, sizeMb: 600, keep: 6, archive: 1, delete: 1, legalHold: 1 },
    { category: 'PATIENT_FILE', label: 'Expedientes de paciente', records: 9, sizeMb: 1620, keep: 9, archive: 0, delete: 0, legalHold: 0 },
  ],
  candidates: [
    { recordId: 'r-1', category: 'POLICY', reference: 'H-CIG-4420-50877 · Cigna', crmId: 'CRMID-AAAA1111', lastActivity: '2014-12-31', inactiveMonths: 142, sizeMb: 45, decision: 'DELETE', reason: 'Plazo de retención de 7 años cumplido' },
    { recordId: 'r-2', category: 'CLAIM', reference: 'CL-48396', crmId: 'CRMID-BBBB2222', lastActivity: '2023-11-16', inactiveMonths: 35, sizeMb: 75, decision: 'ARCHIVE', reason: 'Sin actividad hace 2 años' },
    { recordId: 'r-3', category: 'POLICY', reference: 'H-AET-9910-11804 · Aetna', crmId: 'CRMID-CCCC3333', lastActivity: '2018-12-31', inactiveMonths: 94, sizeMb: 45, decision: 'LEGAL_HOLD', reason: 'Siniestro CL-48174 en trámite' },
  ],
  generatedAt: '2026-11-14T20:00:00Z',
};

describe('formatos de retención', () => {
  it('muestra centavos de dólar y la inactividad en meses o años', () => {
    expect(formatUsd(26.67)).toBe('$26.67');
    expect(formatUsd(0.0674)).toBe('$0.0674');
    expect(formatInactivity(22)).toBe('22 meses');
    expect(formatInactivity(142)).toBe('11 años y 10 m');
    expect(formatInactivity(36)).toBe('3 años');
  });
});

describe('CloudArchiveComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<CloudArchiveComponent>;
  let component: CloudArchiveComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CloudArchiveComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(CloudArchiveComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => http.verify());

  async function load(profile: RetentionProfile = PROFILE): Promise<HTMLElement> {
    http.expectOne(`${API}/audit/retention`).flush(profile);
    await tick();
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  it('muestra los indicadores, la distribución y la política reales del backend', async () => {
    const element = await load();

    expect(element.querySelector('[data-testid="kpi-profiled"]')?.textContent?.trim()).toBe('35');
    expect(element.querySelector('[data-testid="kpi-archive"]')?.textContent?.trim()).toBe('3');
    expect(element.querySelector('[data-testid="kpi-delete"]')?.textContent?.trim()).toBe('4');
    expect(element.querySelector('[data-testid="kpi-savings"]')?.textContent?.replace(/\s/g, '')).toBe('11.54%');
    expect(element.querySelector('[data-testid="retention-rules"]')?.textContent).toContain('Archivar a los 12 meses · eliminar a los 7 años');
    expect(element.querySelectorAll('[data-testid="category-row"]')).toHaveLength(3);
    expect(component.distribution().map((slice) => [slice.decision, slice.count])).toEqual([
      ['KEEP', 24], ['ARCHIVE', 3], ['DELETE', 4], ['LEGAL_HOLD', 4],
    ]);
    expect(element.textContent).not.toContain('1.44');
  });

  it('filtra los candidatos por decisión', async () => {
    const element = await load();
    expect(element.querySelectorAll('[data-testid="candidate-row"]')).toHaveLength(3);

    component.setFilter('LEGAL_HOLD');
    fixture.detectChanges();
    const rows = element.querySelectorAll('[data-testid="candidate-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Retención legal');
    expect(rows[0].textContent).toContain('en trámite');
    expect(rows[0].textContent).toContain('7 años y 10 m');
  });

  it('informa del error cuando el rol no puede ver el perfil', async () => {
    http.expectOne(`${API}/audit/retention`).flush({ status: 403 }, { status: 403, statusText: 'Forbidden' });
    await tick();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain('Tu rol no tiene permiso');
  });
});
