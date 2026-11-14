// Proxy del servidor de desarrollo (ng serve): reenvía /api y /actuator al backend Spring Boot.
// Puerto por defecto 8080; si está ocupado (p. ej. por Jenkins), arranca el backend en otro puerto y usa:
//   $env:API_TARGET = 'http://localhost:8081'; npm start      (PowerShell)
//   API_TARGET=http://localhost:8081 npm start                (bash)
const target = process.env.API_TARGET ?? 'http://localhost:8080';

const backend = { target, secure: false, changeOrigin: true };

export default {
  '/api': backend,
  // Health check usado para despertar el servidor y mostrar su estado.
  '/actuator': backend,
};
