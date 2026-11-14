import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '@env/environment';
import { TokenResponse } from './api/api.models';
import { PatientsApi } from './api/patients.api';
import { authInterceptor } from './auth/auth.interceptor';
import { AuthService } from './auth/auth.service';
import { apiErrorMessage } from './ui/format';

const API = environment.apiUrl;

describe('apiErrorMessage', () => {
  it('lista los errores por campo del ProblemDetail', () => {
    const error = new HttpErrorResponse({
      status: 400,
      error: { status: 400, detail: 'La solicitud contiene 2 campo(s) inválido(s)', errors: { email: 'must be a well-formed email address', firstName: 'must not be blank' } },
    });
    const message = apiErrorMessage(error);
    expect(message).toContain('Correo electrónico debe ser un correo válido');
    expect(message).toContain('Nombre es obligatorio');
  });

  it('usa el detail cuando no hay errores por campo', () => {
    const error = new HttpErrorResponse({ status: 409, error: { status: 409, detail: 'Patient has claims' } });
    expect(apiErrorMessage(error)).toBe('Patient has claims');
  });

  it('informa que el backend no está disponible (sin respuesta o 504 del proxy)', () => {
    expect(apiErrorMessage(new HttpErrorResponse({ status: 0 }))).toContain('No se pudo conectar con el backend');
    expect(apiErrorMessage(new HttpErrorResponse({ status: 504 }))).toContain('No se pudo conectar con el backend');
  });
});

describe('servicios HTTP', () => {
  let http: HttpTestingController;

  const session: TokenResponse = {
    accessToken: 'jwt', tokenType: 'Bearer', expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    email: 'agente@nexo.demo', role: 'AGENT',
  };

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function login(auth: AuthService): void {
    auth.login({ email: session.email, password: 'NexoDemo2026!' }).subscribe();
    http.expectOne(`${API}/auth/login`).flush(session);
  }

  it('verifySession sincroniza el rol con GET /auth/me', () => {
    const auth = TestBed.inject(AuthService);
    login(auth);
    expect(auth.canAudit()).toBe(false);

    auth.verifySession().subscribe();
    const req = http.expectOne(`${API}/auth/me`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer jwt');
    req.flush({ email: session.email, role: 'AUDITOR', expiresAt: session.expiresAt });

    expect(auth.role()).toBe('AUDITOR');
    expect(auth.canAudit()).toBe(true);
  });

  it('verifySession con token inválido cierra la sesión', () => {
    const auth = TestBed.inject(AuthService);
    login(auth);
    auth.verifySession().subscribe({ error: () => undefined });
    http.expectOne(`${API}/auth/me`).flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('PatientsApi actualiza y elimina pólizas en la ruta anidada del paciente', () => {
    const api = TestBed.inject(PatientsApi);

    api.updatePolicy('p-1', 'pol-1', { status: 'ACTIVE' }).subscribe();
    const update = http.expectOne(`${API}/patients/p-1/policies/pol-1`);
    expect(update.request.method).toBe('PUT');
    expect(update.request.body).toEqual({ status: 'ACTIVE' });
    update.flush({});

    api.deletePolicy('p-1', 'pol-1').subscribe();
    const remove = http.expectOne(`${API}/patients/p-1/policies/pol-1`);
    expect(remove.request.method).toBe('DELETE');
    remove.flush(null);
  });
});
