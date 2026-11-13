// Configuración de producción (ng build / Vercel).
// La API está desplegada en Render; su FRONTEND_ORIGINS debe incluir el dominio de Vercel
// (p. ej. https://<proyecto>.vercel.app,https://*.vercel.app) para que CORS permita las llamadas.
export const environment = {
  production: true,
  apiUrl: 'https://erp-insurance-api.onrender.com/api',
};
