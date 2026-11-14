import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '@env/environment';
import { App } from './app';
import {
  AnomalyResponse,
  AuditSummaryResponse,
  ClaimPipeline,
  PageResponse,
  PatientResponse,
  TokenResponse,
} from './core/api/api.models';
import { authInterceptor } from './core/auth/auth.interceptor';
import { AuthService } from './core/auth/auth.service';
import { ErpStore } from './core/state/erp.store';

const API = environment.apiUrl;

const token: TokenResponse = {
  accessToken: 'jwt-demo',
  tokenType: 'Bearer',
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  email: 'admin@nexo.demo',
  role: 'ADMIN',
};

const patient: PatientResponse = {
  id: 'p-1',
  firstName: 'María',
  lastName: 'González',
  email: 'maria@example.test',
  dateOfBirth: '1986-03-14',
  acaEligibilityStatus: 'ELIGIBLE',
  accountStatus: 'ACTIVE',
  createdAt: '2026-01-02T10:00:00Z',
};

const anomalies: AnomalyResponse[] = [
  {
    id: 'a-1', type: 'POLICY_OVERLAP', severity: 'RED', title: 'Pólizas solapadas', description: 'Dos pólizas activas',
    resolutionStatus: 'OPEN', affectedRecordType: 'POLICY', affectedRecordId: 'pol-1',
    patient: { id: 'p-1', fullName: 'María González' }, source: 'Marketplace', confidence: 94,
    autoCorrectable: false, createdAt: new Date().toISOString(),
  },
  {
    id: 'a-2', type: 'OTHER', severity: 'YELLOW', title: 'Teléfono con formato inválido', description: 'Formato',
    resolutionStatus: 'OPEN', affectedRecordType: 'PATIENT', affectedRecordId: 'p-1',
    suggestedCorrectionField: 'phone', suggestedCorrectionValue: '(305) 555-0177',
    autoCorrectable: true, createdAt: new Date().toISOString(),
  },
];

const page = <T>(content: T[]): PageResponse<T> => ({
  content, totalElements: content.length, totalPages: 1, number: 0, size: 100, first: true, last: true,
});

const summary: AuditSummaryResponse = { open: 2, critical: 1, review: 1, resolvedThisMonth: 3 };

const pipeline: ClaimPipeline = {
  OPEN: [{
    id: 'c-1', claimNumber: 'CL-48100', description: 'Consulta', status: 'OPEN', priority: 'HIGH',
    patient: { id: 'p-1', firstName: 'María', lastName: 'González' }, services: [], history: [],
    createdAt: '2026-11-01T10:00:00Z', updatedAt: '2026-11-01T10:00:00Z',
  }],
  IN_REVIEW: [], APPROVED: [], REJECTED: [],
};

describe('App ↔ backend integration', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  /** Responde a las cuatro cargas iniciales que dispara el login. */
  function flushInitialLoad(): void {
    const anomaliesReq = http.expectOne((r) => r.url === `${API}/audit/anomalies`);
    expect(anomaliesReq.request.params.get('resolutionStatus')).toBe('OPEN');
    expect(anomaliesReq.request.headers.get('Authorization')).toBe('Bearer jwt-demo');
    anomaliesReq.flush(page(anomalies));
    http.expectOne(`${API}/audit/summary`).flush(summary);
    http.expectOne(`${API}/claims/pipeline`).flush(pipeline);
    http.expectOne((r) => r.url === `${API}/patients`).flush(page([patient]));
  }

  async function loginAndLoad() {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    TestBed.inject(AuthService).login({ email: token.email, password: 'NexoDemo2026!' }).subscribe();
    http.expectOne(`${API}/auth/login`).flush(token);
    fixture.detectChanges();
    flushInitialLoad();
    await new Promise((resolve) => setTimeout(resolve)); // deja terminar las promesas del store
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  it('muestra el login cuando no hay sesión', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Iniciar sesión');
  });

  it('tras el login carga los datos del backend y los renderiza', async () => {
    const fixture = await loginAndLoad();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Resumen operativo');
    expect(text).toContain('María González');
    expect(text).toContain('Pólizas solapadas');
    expect(TestBed.inject(ErpStore).anomalies()).toHaveLength(2);
  });

  it('resuelve anomalías en lote con POST /api/audit/resolve-batch', async () => {
    await loginAndLoad();
    const store = TestBed.inject(ErpStore);

    const done = store.resolveAnomalies(['a-1', 'a-2'], 'ARCHIVAR_DEFINITIVO');
    const req = http.expectOne(`${API}/audit/resolve-batch`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ ids: ['a-1', 'a-2'], action: 'ARCHIVAR_DEFINITIVO' });
    req.flush({ processed: 2, action: 'ARCHIVAR_DEFINITIVO', ids: ['a-1', 'a-2'] });
    await Promise.resolve();

    http.expectOne((r) => r.url === `${API}/audit/anomalies`).flush(page([]));
    http.expectOne(`${API}/audit/summary`).flush({ ...summary, open: 0 });
    expect(await done).toBe(true);
    expect(store.anomalies()).toHaveLength(0);
  });

  it('mueve un siniestro con PATCH /api/claims/{id}/status', async () => {
    await loginAndLoad();
    const store = TestBed.inject(ErpStore);

    const done = store.moveClaim(pipeline.OPEN[0], 'IN_REVIEW');
    const req = http.expectOne(`${API}/claims/c-1/status`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ status: 'IN_REVIEW' });
    req.flush({ ...pipeline.OPEN[0], status: 'IN_REVIEW' });
    await Promise.resolve();

    http.expectOne(`${API}/claims/pipeline`).flush({ ...pipeline, OPEN: [], IN_REVIEW: [{ ...pipeline.OPEN[0], status: 'IN_REVIEW' }] });
    expect(await done).toBe(true);
    expect(store.pipeline().IN_REVIEW).toHaveLength(1);
  });

  it('cierra la sesión si el backend responde 401', async () => {
    await loginAndLoad();
    void TestBed.inject(ErpStore).loadClaims().catch(() => undefined);
    http.expectOne(`${API}/claims/pipeline`).flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(TestBed.inject(AuthService).isAuthenticated()).toBe(false);
  });
});
