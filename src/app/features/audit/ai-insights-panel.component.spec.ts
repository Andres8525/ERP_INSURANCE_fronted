import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiInsightResponse } from '@core/api/api.models';
import { environment } from '@env/environment';
import { AiInsightsPanelComponent } from './ai-insights-panel.component';
import { REPORT } from './ai-report.testing';

const API = environment.apiUrl;
const tick = () => new Promise((resolve) => setTimeout(resolve));

const INSIGHT: AiInsightResponse = {
  content: '## Resumen\nHay **4** anomalías críticas.',
  report: REPORT,
  provider: 'groq',
  model: 'openai/gpt-oss-120b',
  analyzedAnomalies: 8,
  promptTokens: 300,
  completionTokens: 120,
  latencyMs: 2100,
  generatedAt: '2026-11-14T20:00:00Z',
  cached: false,
};

describe('AiInsightsPanelComponent', () => {
  let http: HttpTestingController;
  let fixture: ComponentFixture<AiInsightsPanelComponent>;
  let component: AiInsightsPanelComponent;

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }

  async function connect(enabled = true): Promise<HTMLElement> {
    http.expectOne(`${API}/audit/ai/status`).flush({ enabled, provider: 'groq', model: 'openai/gpt-oss-120b' });
    await tick();
    await render();
    return fixture.nativeElement;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AiInsightsPanelComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(AiInsightsPanelComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => http.verify());

  it('muestra el proveedor real y el reporte estructurado', async () => {
    const element = await connect();
    expect(element.querySelector('[data-testid="ai-status"]')?.textContent?.trim()).toBe('Groq · conectado');
    expect(element.textContent).not.toContain('Grok');

    const done = component.generate();
    expect(component.loading()).toBe(true);
    await render();
    expect(element.querySelector('[data-testid="ai-loading"]')?.textContent).toContain('Analizando la bandeja con Groq');
    http.expectOne((r) => r.url === `${API}/audit/ai/insights` && !r.params.has('refresh')).flush(INSIGHT);
    await done;
    await render();

    expect(element.querySelector('[data-testid="ai-loading"]')).toBeNull();
    expect(element.querySelector('app-ai-report')).not.toBeNull();
    expect(element.querySelector('[data-testid="ai-content"]')).toBeNull();
    expect(element.querySelectorAll('[data-testid="ai-priority"]')).toHaveLength(2);
    expect(element.textContent).toContain('Groq · openai/gpt-oss-120b');
    expect(element.textContent).toContain('420 tokens');

    const again = component.generate(true);
    http.expectOne((r) => r.url === `${API}/audit/ai/insights` && r.params.get('refresh') === 'true').flush({ ...INSIGHT, cached: true });
    await again;
    await render();
    expect(element.textContent).toContain('Respuesta en caché');
  });

  it('copia el reporte en Markdown al portapapeles', async () => {
    const element = await connect();
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });

    const done = component.generate();
    http.expectOne((r) => r.url === `${API}/audit/ai/insights`).flush(INSIGHT);
    await done;
    await render();

    const copy = [...element.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Copiar');
    copy?.click();
    await tick();
    await render();
    expect(writeText).toHaveBeenCalledWith(INSIGHT.content);
    expect(component.copied()).toBe(true);
    expect(element.textContent).toContain('Copiado ✓');
    expect(element.textContent).toContain('Generado');
  });

  it('usa el Markdown como respaldo cuando el backend no trae reporte', async () => {
    const element = await connect();
    const done = component.generate();
    http.expectOne((r) => r.url === `${API}/audit/ai/insights`).flush({
      ...INSIGHT,
      report: undefined,
      content: '## Diagnóstico\n| Severidad | Casos |\n|---|---|\n| Crítica | 4 |',
    });
    await done;
    await render();

    const content = element.querySelector('[data-testid="ai-content"]');
    expect(content?.querySelector('h4')?.textContent).toBe('Diagnóstico');
    expect(content?.querySelector('table td')?.textContent).toBe('Crítica');
  });

  it('explica cómo resolver la falta de créditos', async () => {
    await connect();
    const done = component.generate();
    http.expectOne((r) => r.url === `${API}/audit/ai/insights`).flush(
      { status: 502, detail: 'La cuenta de Groq no tiene créditos', reason: 'NO_CREDITS' },
      { status: 502, statusText: 'Bad Gateway' },
    );
    await done;
    await render();

    expect(component.loading()).toBe(false);
    expect(component.error()?.reason).toBe('NO_CREDITS');
    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('La cuenta de Groq no tiene créditos');
    expect(alert?.textContent).toContain('consola del proveedor de IA');
  });

  it('desactiva el botón cuando el backend no tiene AI_API_KEY', async () => {
    const element = await connect(false);
    const button = [...element.querySelectorAll('button')].find((b) => b.textContent?.includes('Generar recomendaciones'));
    expect(button?.disabled).toBe(true);
    expect(element.textContent).toContain('AI_API_KEY');
  });
});
