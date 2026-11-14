import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { retry, timer } from 'rxjs';
import { environment } from '@env/environment';

/** Estados transitorios: sin conexión (0) o el proxy de Render mientras el servicio arranca (502-504). */
export const TRANSIENT_STATUSES = new Set([0, 502, 503, 504]);
/** Esperas entre reintentos: 1 s y 3 s. */
export const RETRY_DELAYS_MS = [1000, 3000];

export function isTransientError(error: unknown): boolean {
  return (
    error instanceof HttpErrorResponse &&
    TRANSIENT_STATUSES.has(error.status) &&
    // Los timeouts propios (timeout.interceptor) ya esperaron demasiado: no se reintentan.
    error.statusText !== 'Timeout'
  );
}

/**
 * Reintenta las lecturas (GET) contra la API ante errores transitorios.
 * Las escrituras no se reintentan aquí para no duplicar operaciones (el login lo hace AuthService).
 */
export const retryInterceptor: HttpInterceptorFn = (request, next) => {
  if (request.method !== 'GET' || !request.url.startsWith(environment.apiUrl)) return next(request);
  return next(request).pipe(
    retry({
      count: RETRY_DELAYS_MS.length,
      delay: (error: unknown, attempt: number) => {
        if (!isTransientError(error)) throw error;
        return timer(RETRY_DELAYS_MS[attempt - 1]);
      },
    }),
  );
};
