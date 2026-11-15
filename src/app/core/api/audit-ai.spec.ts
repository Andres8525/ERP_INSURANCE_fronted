import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { environment } from '@env/environment';
import { aiErrorView, apiErrorMessage } from '../ui/format';
import { AuditApi } from './audit.api';

const API = environment.apiUrl;

describe('AuditApi: asistente IA', () => {
  let http: HttpTestingController;
  let api: AuditApi;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    api = TestBed.inject(AuditApi);
  });

  afterEach(() => http.verify());

  it('consulta el estado y pide recomendaciones con o sin refresh', () => {
    api.aiStatus().subscribe();
    http.expectOne({ method: 'GET', url: `${API}/audit/ai/status` }).flush({ enabled: true, provider: 'grok', model: 'grok-4.7' });

    api.aiInsights().subscribe();
    const cached = http.expectOne((r) => r.url === `${API}/audit/ai/insights`);
    expect(cached.request.method).toBe('POST');
    expect(cached.request.params.has('refresh')).toBe(false);
    cached.flush({});

    api.aiInsights(true).subscribe();
    const fresh = http.expectOne((r) => r.url === `${API}/audit/ai/insights`);
    expect(fresh.request.params.get('refresh')).toBe('true');
    fresh.flush({});
  });

  it('pide la explicación de una anomalía concreta', () => {
    api.aiExplanation('a-1').subscribe();
    http.expectOne({ method: 'POST', url: `${API}/audit/anomalies/a-1/ai-explanation` }).flush({});
  });
});

describe('errores del asistente IA', () => {
  it('muestra el detalle del backend en lugar de "no se pudo conectar" cuando la API sí respondió', () => {
    const noCredits = new HttpErrorResponse({
      status: 502,
      error: { status: 502, detail: 'La cuenta de xAI no tiene créditos', reason: 'NO_CREDITS' },
    });
    expect(apiErrorMessage(noCredits)).toBe('La cuenta de xAI no tiene créditos');
    expect(aiErrorView(noCredits)).toEqual({
      message: 'La cuenta de xAI no tiene créditos',
      guidance: 'Carga créditos o sube el límite de gasto en console.x.ai → Billing.',
      reason: 'NO_CREDITS',
    });
  });

  it('sigue avisando de backend caído cuando el 502 no trae ProblemDetail', () => {
    expect(apiErrorMessage(new HttpErrorResponse({ status: 502, error: '<html>Bad Gateway</html>' }))).toContain(
      'No se pudo conectar con el backend',
    );
    expect(aiErrorView(new HttpErrorResponse({ status: 0 })).guidance).toBeUndefined();
  });

  it('explica cómo activar la IA cuando falta la clave', () => {
    const view = aiErrorView(
      new HttpErrorResponse({ status: 503, error: { status: 503, detail: 'Sin clave', reason: 'NOT_CONFIGURED' } }),
    );
    expect(view.guidance).toContain('GROK_API_KEY');
  });
});
