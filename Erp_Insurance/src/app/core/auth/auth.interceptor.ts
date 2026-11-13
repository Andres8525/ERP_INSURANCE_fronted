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
      const isLogin = request.url.endsWith('/auth/login');
      if (error instanceof HttpErrorResponse && error.status === 401 && !isLogin) {
        auth.logout();
      }
      return throwError(() => error);
    }),
  );
};
