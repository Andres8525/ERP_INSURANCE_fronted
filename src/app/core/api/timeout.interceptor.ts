import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { TimeoutError, catchError, throwError, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';

/** Un arranque en frío de Render free ronda el minuto; pasado este margen se informa al usuario. */
export const API_TIMEOUT_MS = 90_000;

/**
 * Corta las llamadas a la API que superan API_TIMEOUT_MS y las convierte en un 504 "Timeout",
 * que la interfaz muestra como "No se pudo conectar con el backend" (ver apiErrorMessage).
 */
export const timeoutInterceptor: HttpInterceptorFn = (request, next) => {
  if (!request.url.startsWith(environment.apiUrl)) return next(request);
  return next(request).pipe(
    timeout(API_TIMEOUT_MS),
    catchError((error: unknown) =>
      throwError(() =>
        error instanceof TimeoutError
          ? new HttpErrorResponse({ status: 504, statusText: 'Timeout', url: request.url })
          : error,
      ),
    ),
  );
};
