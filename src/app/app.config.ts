import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { retryInterceptor } from './core/api/retry.interceptor';
import { ServerStatusService } from './core/api/server-status.service';
import { timeoutInterceptor } from './core/api/timeout.interceptor';
import { authInterceptor } from './core/auth/auth.interceptor';
import { OfflineService } from './core/workers/offline/offline.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor, retryInterceptor, timeoutInterceptor])),

    provideAppInitializer(() => {
      const server = inject(ServerStatusService);
      void server.warmUp();
      server.startKeepAlive();
      void inject(OfflineService).register();
    }),
  ],
};
