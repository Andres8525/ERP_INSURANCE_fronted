import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { AnomalyResponse } from '@core/api/api.models';
import { environment } from '@env/environment';
import { AnomalyDetailComponent } from './anomaly-detail.component';
import { REPORT } from './ai-report.testing';

const API = environment.apiUrl;
const tick = () => new Promise((resolve) => setTimeout(resolve));

const ANOMALY = {
  id: 'a-1',
  type: 'POLICY_OVERLAP',
  severity: 'RED',
  title: 'Pólizas solapadas',
  description: 'Dos pólizas activas en el mismo periodo.',
  resolutionStatus: 'OPEN',
  affectedRecordType: 'POLICY',
  affectedRecordId: 'p-1',
  autoCorrectable: false,
  createdAt: '2026-11-14T10:00:00Z',
} as AnomalyResponse;

describe('AnomalyDetailComponent: explicación con IA', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<AnomalyDetailComponent>;

  beforeEach(async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [AnomalyDetailComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AnomalyDetailComponent);
    fixture.componentRef.setInput('anomaly', ANOMALY);
    fixture.detectChanges();
  });

  function button(text: string): HTMLButtonElement | undefined {
    return [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find((b) => b.textContent?.includes(text));
  }

  it('muestra la explicación como pasos estructurados con el proveedor real', async () => {
    button('Explicar con IA')?.click();
    fixture.detectChanges();
    expect(button('Consultando a la IA')).toBeDefined();

    http.expectOne(`${API}/audit/anomalies/a-1/ai-explanation`).flush({
      content: '## Resumen',
      report: { ...REPORT, priorities: [] },
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      analyzedAnomalies: 1,
      promptTokens: 10,
      completionTokens: 10,
      latencyMs: 900,
      generatedAt: '2026-11-14T10:00:00Z',
      cached: false,
    });
    await tick();
    fixture.detectChanges();

    const explanation = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="ai-explanation"]');
    expect(explanation?.querySelector('app-ai-report')).not.toBeNull();
    expect(explanation?.textContent).toContain('Cómo corregirlo');
    expect(explanation?.querySelectorAll('[data-testid="ai-action"]')).toHaveLength(2);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Groq · openai/gpt-oss-120b · 900 ms');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Grok');
  });

  it('muestra el motivo cuando la IA no está disponible', async () => {
    button('Explicar con IA')?.click();
    http.expectOne(`${API}/audit/anomalies/a-1/ai-explanation`).flush(
      { status: 429, detail: 'Límite de uso de Groq alcanzado', reason: 'RATE_LIMITED' },
      { status: 429, statusText: 'Too Many Requests' },
    );
    await tick();
    fixture.detectChanges();

    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('Límite de uso de Groq alcanzado');
    expect(button('Explicar con IA')?.disabled).toBe(false);
  });
});
