import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { environment } from '../../../environments/environment';
import { LoginRequest, SessionResponse, TokenResponse, UserRole } from '../api/api.models';

const STORAGE_KEY = 'erp.session';

/** Sesión JWT. El token vive en sessionStorage (se borra al cerrar la pestaña). */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly session = signal<TokenResponse | null>(readStoredSession());

  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly email = computed(() => this.session()?.email ?? '');
  readonly role = computed<UserRole | null>(() => this.session()?.role ?? null);
  /** Solo ADMIN y AUDITOR pueden ver y resolver anomalías (ver AuditController). */
  readonly canAudit = computed(() => this.role() === 'ADMIN' || this.role() === 'AUDITOR');

  login(request: LoginRequest): Observable<TokenResponse> {
    return this.http
      .post<TokenResponse>(`${environment.apiUrl}/auth/login`, request)
      .pipe(tap((response) => this.store(response)));
  }

  /**
   * Confirma con el backend que el token guardado sigue siendo válido (p. ej. tras recargar la página)
   * y sincroniza email/rol. Un 401 lo resuelve el interceptor cerrando la sesión.
   */
  verifySession(): Observable<SessionResponse> {
    return this.http.get<SessionResponse>(`${environment.apiUrl}/auth/me`).pipe(
      tap((me) => {
        const current = this.session();
        if (current) this.store({ ...current, email: me.email, role: me.role, expiresAt: me.expiresAt });
      }),
    );
  }

  logout(): void {
    this.store(null);
  }

  /** Token vigente o null si no hay sesión o ya expiró. */
  token(): string | null {
    const current = this.session();
    if (!current) return null;
    if (Date.parse(current.expiresAt) <= Date.now()) {
      this.logout();
      return null;
    }
    return current.accessToken;
  }

  private store(value: TokenResponse | null): void {
    this.session.set(value);
    try {
      if (value) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
      else sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Almacenamiento no disponible (modo privado): la sesión queda solo en memoria.
    }
  }
}

function readStoredSession(): TokenResponse | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as TokenResponse;
    return Date.parse(parsed.expiresAt) > Date.now() ? parsed : null;
  } catch {
    return null;
  }
}
