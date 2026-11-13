import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { apiErrorMessage } from '../../core/ui/format';
import { environment } from '../../../environments/environment';

interface DemoAccount {
  email: string;
  role: string;
  hint: string;
}

@Component({
  selector: 'app-login-page',
  imports: [FormsModule],
  templateUrl: './login-page.component.html',
})
export class LoginPageComponent {
  private readonly auth = inject(AuthService);

  /** Usuarios creados por DemoDataSeeder (solo perfil demo del backend). */
  readonly demoAccounts: DemoAccount[] = [
    { email: 'admin@nexo.demo', role: 'Administrador', hint: 'Acceso total' },
    { email: 'auditor@nexo.demo', role: 'Auditor', hint: 'Auditoría IA' },
    { email: 'agente@nexo.demo', role: 'Agente', hint: 'Sin auditoría' },
  ];
  readonly demoPassword = 'NexoDemo2026!';
  readonly apiUrl = environment.apiUrl;

  email = 'admin@nexo.demo';
  password = this.demoPassword;
  readonly submitting = signal(false);
  readonly error = signal<string | null>(null);

  useAccount(account: DemoAccount): void {
    this.email = account.email;
    this.password = this.demoPassword;
    this.error.set(null);
  }

  submit(): void {
    if (this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null);
    this.auth.login({ email: this.email.trim(), password: this.password }).subscribe({
      next: () => this.submitting.set(false),
      error: (err: unknown) => {
        this.submitting.set(false);
        this.error.set(apiErrorMessage(err));
      },
    });
  }
}
