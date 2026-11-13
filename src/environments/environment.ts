// Configuración de producción (ng build). Cambia apiUrl por la URL pública del backend al desplegar
// y agrega ese origen del frontend en FRONTEND_ORIGINS del backend.
export const environment = {
  production: true,
  apiUrl: 'http://localhost:8080/api',
};
