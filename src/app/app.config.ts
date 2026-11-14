import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { ServerStatusService } from './core/api/server-status.service';
import { authInterceptor } from './core/auth/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    // Despierta el backend en cuanto se abre la página (sin bloquear el arranque): mientras el usuario
    // escribe sus credenciales, Render ya está levantando el servicio.
    provideAppInitializer(() => {
      void inject(ServerStatusService).warmUp();
    }),
  ],
};
