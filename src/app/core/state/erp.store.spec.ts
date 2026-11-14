import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { ScanResponse } from '../api/api.models';
import { AuthService } from '../auth/auth.service';
import { ErpStore } from './erp.store';

const API = environment.apiUrl;
const tick = () => new Promise((resolve) => setTimeout(resolve));

const SCAN: ScanResponse = {
  analyzedRecords: 15,
  findings: 3,
  created: 2,
  alreadyKnown: 1,
  engineMode: 'IN_PROCESS',
  engineVersion: 'anomaly-engine/1.0.0',
  appliedRules: ['email-format', 'phone-format'],
  correlationId: 'c0ffee',
  durationMs: 42,
};

describe('ErpStore.scanAnomalies', () => {
  let http: HttpTestingController;
  let store: ErpStore;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(ErpStore);
    TestBed.inject(AuthService).login({ email: 'auditor@nexo.demo', password: 'NexoDemo2026!' }).subscribe();
    http.expectOne(`${API}/auth/login`).flush({
      accessToken: 'jwt', tokenType: 'Bearer', expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      email: 'auditor@nexo.demo', role: 'AUDITOR',
    });
  });

  afterEach(() => http.verify());

  function flushAuditReload(): void {
    http.expectOne((r) => r.url === `${API}/audit/anomalies`).flush({
      content: [], totalElements: 0, totalPages: 0, number: 0, size: 100, first: true, last: true,
    });
    http.expectOne(`${API}/audit/summary`).flush({ open: 0, critical: 0, review: 0, resolvedThisMonth: 0 });
  }

  it('guarda el resultado del motor y recarga la bandeja', async () => {
    const done = store.scanAnomalies();
    const scan = http.expectOne(`${API}/audit/scan`);
    expect(scan.request.method).toBe('POST');
    scan.flush(SCAN);
    await tick();
    flushAuditReload();

    expect(await done).toBe(true);
    expect(store.lastScan()).toEqual(SCAN);
    expect(store.notice()?.text).toBe('Análisis completado: 2 hallazgo(s) nuevo(s) en 15 registros.');
  });

  it('informa cuando no hay hallazgos nuevos', async () => {
    const done = store.scanAnomalies();
    http.expectOne(`${API}/audit/scan`).flush({ ...SCAN, created: 0, alreadyKnown: 3 });
    await tick();
    flushAuditReload();

    await done;
    expect(store.notice()?.text).toContain('sin hallazgos nuevos');
  });

  it('muestra un error si el motor no está disponible', async () => {
    const done = store.scanAnomalies();
    http.expectOne(`${API}/audit/scan`).flush(
      { status: 503, detail: 'Anomaly engine failed: UNAVAILABLE' },
      { status: 503, statusText: 'Service Unavailable' },
    );

    expect(await done).toBe(false);
    expect(store.notice()?.kind).toBe('error');
    expect(store.lastScan()).toBeNull();
  });
});
