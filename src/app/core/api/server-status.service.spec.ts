import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { ServerStatusService, WAKING_THRESHOLD_MS } from './server-status.service';

describe('ServerStatusService', () => {
  let http: HttpTestingController;
  let server: ServerStatusService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    server = TestBed.inject(ServerStatusService);
  });

  afterEach(() => {
    server.stopKeepAlive();
    vi.useRealTimers();
    http.verify();
  });

  it('pasa a ready y registra la latencia cuando el health check responde', async () => {
    const result = server.warmUp();
    expect(server.state()).toBe('checking');
    http.expectOne(environment.healthUrl).flush({ status: 'UP' });
    expect(await result).toBe(true);
    expect(server.state()).toBe('ready');
    expect(server.latencyMs()).not.toBeNull();
    expect(server.lastCheck()).toBeInstanceOf(Date);
  });

  it('marca offline si el backend no responde', async () => {
    const result = server.warmUp();
    http.expectOne(environment.healthUrl).flush(null, { status: 503, statusText: 'Service Unavailable' });
    expect(await result).toBe(false);
    expect(server.state()).toBe('offline');
  });

  it('indica que el servidor está despertando si tarda más de lo normal', async () => {
    vi.useFakeTimers();
    const result = server.warmUp();
    vi.advanceTimersByTime(WAKING_THRESHOLD_MS + 1);
    expect(server.state()).toBe('waking');
    http.expectOne(environment.healthUrl).flush({ status: 'UP' });
    await result;
    expect(server.state()).toBe('ready');
  });

  it('comparte una sola petición entre llamadas simultáneas', async () => {
    const first = server.warmUp();
    const second = server.warmUp();
    expect(second).toBe(first);
    http.expectOne(environment.healthUrl).flush({ status: 'UP' });
    await Promise.all([first, second]);
  });

  it('el keep-alive solo hace ping con la pestaña visible', () => {
    vi.useFakeTimers();
    const visibility = vi.spyOn(document, 'visibilityState', 'get');

    visibility.mockReturnValue('hidden');
    server.startKeepAlive(1000);
    vi.advanceTimersByTime(1000);
    http.expectNone(environment.healthUrl);

    visibility.mockReturnValue('visible');
    vi.advanceTimersByTime(1000);
    http.expectOne(environment.healthUrl).flush({ status: 'UP' });
    visibility.mockRestore();
  });
});
