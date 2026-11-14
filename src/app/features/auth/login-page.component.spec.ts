import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '@env/environment';
import { TokenResponse } from '@core/api/api.models';
import { authInterceptor } from '@core/auth/auth.interceptor';
import { AuthService } from '@core/auth/auth.service';
import { LoginPageComponent } from './login-page.component';

const API = environment.apiUrl;
const token = (email: string, role: TokenResponse['role']): TokenResponse => ({
  accessToken: 'jwt', tokenType: 'Bearer', expiresAt: new Date(Date.now() + 3_600_000).toISOString(), email, role,
});

describe('LoginPageComponent', () => {
  let http: HttpTestingController;
  let component: LoginPageComponent;

  beforeEach(async () => {
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [LoginPageComponent],
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    component = TestBed.createComponent(LoginPageComponent).componentInstance;
  });

  afterEach(() => http.verify());

  it('inicia sesión con POST /auth/login', () => {
    component.submit();
    const req = http.expectOne(`${API}/auth/login`);
    expect(req.request.body).toEqual({ email: 'admin@nexo.demo', password: 'NexoDemo2026!' });
    req.flush(token('admin@nexo.demo', 'ADMIN'));
    expect(TestBed.inject(AuthService).isAuthenticated()).toBe(true);
  });

  it('muestra un mensaje claro con credenciales incorrectas', () => {
    component.password.set('incorrecta-123');
    component.submit();
    http.expectOne(`${API}/auth/login`).flush({ status: 401 }, { status: 401, statusText: 'Unauthorized' });
    expect(component.error()).toBe('Correo o contraseña incorrectos.');
    expect(TestBed.inject(AuthService).isAuthenticated()).toBe(false);
  });

  it('valida el registro antes de llamar al backend', () => {
    component.setMode('register');
    component.email.set('nuevo@empresa.com');
    component.password.set('corta');
    component.confirmPassword.set('corta');
    expect(component.canSubmit()).toBe(false);
    component.submit();
    expect(component.error()).toContain('al menos 12 caracteres');

    component.password.set('ClaveSegura2026!');
    component.confirmPassword.set('OtraClave2026!!');
    expect(component.canSubmit()).toBe(false);
    http.expectNone(`${API}/auth/register`);
  });

  it('registra la cuenta y deja la sesión iniciada', () => {
    component.setMode('register');
    component.email.set(' Nuevo@Empresa.com ');
    component.password.set('ClaveSegura2026!');
    component.confirmPassword.set('ClaveSegura2026!');
    component.submit();

    const req = http.expectOne(`${API}/auth/register`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'Nuevo@Empresa.com', password: 'ClaveSegura2026!' });
    req.flush(token('nuevo@empresa.com', 'AGENT'), { status: 201, statusText: 'Created' });

    const auth = TestBed.inject(AuthService);
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.role()).toBe('AGENT');
  });

  it('informa si el correo ya está registrado', () => {
    component.setMode('register');
    component.email.set('admin@nexo.demo');
    component.password.set('ClaveSegura2026!');
    component.confirmPassword.set('ClaveSegura2026!');
    component.submit();
    http.expectOne(`${API}/auth/register`).flush({ status: 409 }, { status: 409, statusText: 'Conflict' });
    expect(component.error()).toContain('Ya existe una cuenta');
  });
});
