import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '@env/environment';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);
  if (!request.url.startsWith(environment.apiUrl)) return next(request);

  const token = auth.token();
  const authorized = token
    ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : request;

  return next(authorized).pipe(
    catchError((error: unknown) => {
      const isAuthForm = request.url.endsWith('/auth/login') || request.url.endsWith('/auth/register');
      if (error instanceof HttpErrorResponse && error.status === 401 && !isAuthForm) {
        auth.logout();
      }
      return throwError(() => error);
    }),
  );
};
