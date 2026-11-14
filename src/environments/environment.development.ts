// Configuración de desarrollo (ng serve). Las llamadas van a /api y /actuator en el mismo origen y
// proxy.conf.mjs las reenvía al backend (API_TARGET, por defecto http://localhost:8080).
export const environment = {
  production: false,
  apiUrl: '/api',
  /** Health check público del backend: se usa para despertar el servidor y saber si está disponible. */
  healthUrl: '/actuator/health',
};
