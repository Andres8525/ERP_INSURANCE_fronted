import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

/** Adjunta `Authorization: Bearer <jwt>` a las llamadas a la API y cierra sesión ante un 401. */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  if (!request.url.startsWith(environment.apiUrl)) return next(request);

  const token = auth.token();
  const authorized = token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(authorized).pipe(
    catchError((error: unknown) => {
      // En login/registro un 401 significa credenciales inválidas, no una sesión vencida.
      const isAuthForm = request.url.endsWith('/auth/login') || request.url.endsWith('/auth/register');
      if (error instanceof HttpErrorResponse && error.status === 401 && !isAuthForm) {
        auth.logout();
      }
      return throwError(() => error);
    }),
  );
};
