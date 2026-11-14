import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { TimeoutError, catchError, throwError, timeout } from 'rxjs';
import { environment } from '@env/environment';

export const API_TIMEOUT_MS = 90_000;

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
