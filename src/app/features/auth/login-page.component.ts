import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Observable } from 'rxjs';
import { TokenResponse } from '../../core/api/api.models';
import { ServerStatusService } from '../../core/api/server-status.service';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../core/ui/format';

interface DemoAccount {
  email: string;
  role: string;
  hint: string;
}

type Mode = 'login' | 'register';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MIN_PASSWORD_LENGTH = 12;
/** Tras este tiempo sin respuesta se avisa de que el servidor gratuito puede estar arrancando. */
const SLOW_REQUEST_MS = 4000;

/** Inicio de sesión y registro de cuentas (POST /api/auth/login y /api/auth/register). */
@Component({
  selector: 'app-login-page',
  imports: [FormsModule],
  templateUrl: './login-page.component.html',
})
export class LoginPageComponent implements OnDestroy {
  private readonly auth = inject(AuthService);
  /** Estado del backend (se despierta al abrir la página; ver app.config.ts). */
  readonly server = inject(ServerStatusService);

  /** Usuarios creados por DemoDataSeeder en el backend. */
  readonly demoAccounts: DemoAccount[] = [
    { email: 'admin@nexo.demo', role: 'Administrador', hint: 'Acceso total' },
    { email: 'auditor@nexo.demo', role: 'Auditor', hint: 'Auditoría IA' },
    { email: 'agente@nexo.demo', role: 'Agente', hint: 'Sin auditoría' },
  ];
  readonly demoPassword = 'NexoDemo2026!';
  readonly minLength = MIN_PASSWORD_LENGTH;

  readonly mode = signal<Mode>('login');
  readonly submitting = signal(false);
  readonly slow = signal(false);
  readonly error = signal<string | null>(null);
  readonly showPassword = signal(false);

  // Campos del formulario (señales para validar en vivo con detección de cambios zoneless).
  readonly email = signal('admin@nexo.demo');
  readonly password = signal(this.demoPassword);
  readonly confirmPassword = signal('');

  readonly emailValid = computed(() => EMAIL_PATTERN.test(this.email().trim()));
  readonly passwordLongEnough = computed(() => this.password().length >= MIN_PASSWORD_LENGTH);
  readonly passwordsMatch = computed(() => this.password() === this.confirmPassword());
  readonly canSubmit = computed(() => {
    if (!this.emailValid() || !this.password()) return false;
    if (this.mode() === 'login') return true;
    return this.passwordLongEnough() && this.passwordsMatch();
  });

  private slowTimer: ReturnType<typeof setTimeout> | undefined;

  setMode(mode: Mode): void {
    this.mode.set(mode);
    this.error.set(null);
    if (mode === 'register') {
      this.email.set('');
      this.password.set('');
      this.confirmPassword.set('');
    } else {
      this.useAccount(this.demoAccounts[0]);
    }
  }

  useAccount(account: DemoAccount): void {
    this.mode.set('login');
    this.email.set(account.email);
    this.password.set(this.demoPassword);
    this.error.set(null);
  }

  submit(): void {
    if (this.submitting()) return;
    if (!this.canSubmit()) {
      this.error.set(this.validationMessage());
      return;
    }
    const credentials = { email: this.email().trim(), password: this.password() };
    const request$: Observable<TokenResponse> =
      this.mode() === 'login' ? this.auth.login(credentials) : this.auth.register(credentials);

    this.submitting.set(true);
    this.error.set(null);
    this.slowTimer = setTimeout(() => this.slow.set(true), SLOW_REQUEST_MS);
    request$.subscribe({
      next: () => this.finish(),
      error: (err: unknown) => {
        this.finish();
        this.error.set(this.describeError(err));
      },
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.slowTimer);
  }

  private finish(): void {
    clearTimeout(this.slowTimer);
    this.submitting.set(false);
    this.slow.set(false);
  }

  private validationMessage(): string {
    if (!this.emailValid()) return 'Ingresa un correo electrónico válido.';
    if (!this.password()) return 'Ingresa tu contraseña.';
    if (!this.passwordLongEnough()) return `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
    return 'Las contraseñas no coinciden.';
  }

  private describeError(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (this.mode() === 'login' && (err.status === 401 || err.status === 400)) {
        return 'Correo o contraseña incorrectos.';
      }
      if (this.mode() === 'register' && err.status === 409) {
        return 'Ya existe una cuenta con ese correo. Inicia sesión.';
      }
      if (this.mode() === 'register' && err.status === 403) {
        return 'El registro de nuevas cuentas está deshabilitado.';
      }
    }
    return apiErrorMessage(err);
  }
}
