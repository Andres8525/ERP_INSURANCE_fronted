// Configuración de desarrollo (ng serve). Las llamadas van a /api en el mismo origen y
// proxy.conf.mjs las reenvía al backend (API_TARGET, por defecto http://localhost:8080).
export const environment = {
  production: false,
  apiUrl: '/api',
};
