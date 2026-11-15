import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AiInsightResponse } from '@core/api/api.models';
import { environment } from '@env/environment';
import { AiInsightsPanelComponent } from './ai-insights-panel.component';

const API = environment.apiUrl;
const tick = () => new Promise((resolve) => setTimeout(resolve));

const INSIGHT: AiInsightResponse = {
  content: '## Diagnóstico\nHay **4** anomalías críticas.\n\n## Acciones recomendadas\n- Revisar pólizas solapadas',
  provider: 'grok',
  model: 'grok-4.7',
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

  it('muestra el estado del asistente y renderiza las recomendaciones de Grok', async () => {
    http.expectOne(`${API}/audit/ai/status`).flush({ enabled: true, provider: 'grok', model: 'grok-4.7' });
    await tick();
    await render();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('[data-testid="ai-status"]')?.textContent).toContain('Conectado · grok-4.7');

    const done = component.generate();
    expect(component.loading()).toBe(true);
    http.expectOne((r) => r.url === `${API}/audit/ai/insights` && !r.params.has('refresh')).flush(INSIGHT);
    await done;
    await render();

    const content = element.querySelector('[data-testid="ai-content"]');
    expect(content?.querySelector('h4')?.textContent).toBe('Diagnóstico');
    expect(content?.querySelector('strong')?.textContent).toBe('4');
    expect(content?.querySelectorAll('li')).toHaveLength(1);
    expect(element.textContent).toContain('420 tokens');

    const again = component.generate(true);
    http.expectOne((r) => r.url === `${API}/audit/ai/insights` && r.params.get('refresh') === 'true').flush({
      ...INSIGHT,
      cached: false,
      content: 'Nuevo',
    });
    await again;
    expect(component.insight()?.content).toBe('Nuevo');
  });

  it('explica cómo resolver la falta de créditos de xAI', async () => {
    http.expectOne(`${API}/audit/ai/status`).flush({ enabled: true, provider: 'grok', model: 'grok-4.7' });
    await tick();

    const done = component.generate();
    http.expectOne((r) => r.url === `${API}/audit/ai/insights`).flush(
      { status: 502, detail: 'La cuenta de xAI no tiene créditos', reason: 'NO_CREDITS' },
      { status: 502, statusText: 'Bad Gateway' },
    );
    await done;
    await render();

    expect(component.loading()).toBe(false);
    expect(component.error()?.reason).toBe('NO_CREDITS');
    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('La cuenta de xAI no tiene créditos');
    expect(alert?.textContent).toContain('consola del proveedor de IA');
  });

  it('desactiva el botón cuando el backend no tiene GROK_API_KEY', async () => {
    http.expectOne(`${API}/audit/ai/status`).flush({ enabled: false, provider: 'grok', model: 'grok-4.7' });
    await tick();
    await render();
    const element: HTMLElement = fixture.nativeElement;
    const button = [...element.querySelectorAll('button')].find((b) => b.textContent?.includes('Generar recomendaciones'));
    expect(button?.disabled).toBe(true);
    expect(element.textContent).toContain('GROK_API_KEY');
  });
});
