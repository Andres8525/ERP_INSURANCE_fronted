import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { retry, timer } from 'rxjs';
import { environment } from '@env/environment';

export const TRANSIENT_STATUSES = new Set([0, 502, 503, 504]);

export const RETRY_DELAYS_MS = [1000, 3000];

export function isTransientError(error: unknown): boolean {
  return (
    error instanceof HttpErrorResponse &&
    TRANSIENT_STATUSES.has(error.status) &&

    error.statusText !== 'Timeout'
  );
}

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
