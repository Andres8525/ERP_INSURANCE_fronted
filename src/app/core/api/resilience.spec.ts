import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { RETRY_DELAYS_MS, retryInterceptor } from './retry.interceptor';
import { API_TIMEOUT_MS, timeoutInterceptor } from './timeout.interceptor';

const API = environment.apiUrl;

describe('resiliencia ante un backend que despierta', () => {
  let http: HttpTestingController;
  let client: HttpClient;

  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([retryInterceptor, timeoutInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
  });

  afterEach(() => {
    vi.useRealTimers();
    http.verify();
  });

  it('reintenta un GET que recibe 503 y entrega la respuesta correcta', () => {
    let body: unknown;
    client.get(`${API}/claims/pipeline`).subscribe((value) => (body = value));

    http.expectOne(`${API}/claims/pipeline`).flush(null, { status: 503, statusText: 'Service Unavailable' });
    vi.advanceTimersByTime(RETRY_DELAYS_MS[0]);
    http.expectOne(`${API}/claims/pipeline`).flush({ OPEN: [] });

    expect(body).toEqual({ OPEN: [] });
  });

  it('no reintenta errores definitivos como 404', () => {
    let error: HttpErrorResponse | undefined;
    client.get(`${API}/claims/x`).subscribe({ error: (e: HttpErrorResponse) => (error = e) });
    http.expectOne(`${API}/claims/x`).flush(null, { status: 404, statusText: 'Not Found' });
    vi.advanceTimersByTime(10_000);
    http.expectNone(`${API}/claims/x`);
    expect(error?.status).toBe(404);
  });

  it('no reintenta escrituras para no duplicar operaciones', () => {
    let error: HttpErrorResponse | undefined;
    client.post(`${API}/claims`, {}).subscribe({ error: (e: HttpErrorResponse) => (error = e) });
    http.expectOne(`${API}/claims`).flush(null, { status: 503, statusText: 'Service Unavailable' });
    vi.advanceTimersByTime(10_000);
    http.expectNone(`${API}/claims`);
    expect(error?.status).toBe(503);
  });

  it('corta las llamadas que superan el tiempo límite con un 504 que no se reintenta', () => {
    let error: HttpErrorResponse | undefined;
    client.get(`${API}/patients`).subscribe({ error: (e: HttpErrorResponse) => (error = e) });
    const pending = http.expectOne(`${API}/patients`);
    vi.advanceTimersByTime(API_TIMEOUT_MS + 1);
    expect(pending.cancelled).toBe(true);
    expect(error?.status).toBe(504);
    expect(error?.statusText).toBe('Timeout');
    vi.advanceTimersByTime(10_000);
    http.expectNone(`${API}/patients`);
  });

  it('el login se recupera de un 502 mientras el servidor arranca', () => {
    const auth = TestBed.inject(AuthService);
    auth.login({ email: 'admin@nexo.demo', password: 'NexoDemo2026!' }).subscribe();

    http.expectOne(`${API}/auth/login`).flush(null, { status: 502, statusText: 'Bad Gateway' });
    vi.advanceTimersByTime(RETRY_DELAYS_MS[0]);
    http.expectOne(`${API}/auth/login`).flush({
      accessToken: 'jwt', tokenType: 'Bearer', expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      email: 'admin@nexo.demo', role: 'ADMIN',
    });

    expect(auth.isAuthenticated()).toBe(true);
  });

  it('el login no se reintenta con credenciales incorrectas', () => {
    const auth = TestBed.inject(AuthService);
    auth.login({ email: 'admin@nexo.demo', password: 'incorrecta-123' }).subscribe({ error: () => undefined });
    http.expectOne(`${API}/auth/login`).flush(null, { status: 401, statusText: 'Unauthorized' });
    vi.advanceTimersByTime(10_000);
    http.expectNone(`${API}/auth/login`);
    expect(auth.isAuthenticated()).toBe(false);
  });
});
