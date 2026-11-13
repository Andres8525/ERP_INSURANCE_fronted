# ERP Insurance — Frontend

Interfaz Angular 21 + Tailwind CSS 4 del ERP para corredoras de seguros médicos ACA. Consume la API Spring Boot del repositorio [ERP_INSURANCE_backend](https://github.com/Andres8525/ERP_INSURANCE_backend).

## Puesta en marcha

Requisitos: Node.js 20+ y el backend en ejecución (perfil demo).

```powershell
npm install
npm start                    # http://localhost:4200, backend en http://localhost:8080
```

En desarrollo la app llama a `/api` y [proxy.conf.mjs](proxy.conf.mjs) reenvía esas peticiones al backend. Si el puerto 8080 está ocupado (por ejemplo, por Jenkins), arranca el backend en otro puerto e indica el destino con `API_TARGET`:

```powershell
$env:API_TARGET = 'http://localhost:8081'; npm start
```

Cuentas demo (contraseña `NexoDemo2026!`): `admin@nexo.demo` (administrador), `auditor@nexo.demo` (auditor) y `agente@nexo.demo` (agente, sin acceso a auditoría). La pantalla de login tiene accesos rápidos.

## Vistas

| Vista | Endpoints |
| --- | --- |
| Login | `POST /api/auth/login`, `GET /api/auth/me` (valida la sesión al recargar) |
| Resumen | Métricas calculadas con pacientes, siniestros y anomalías |
| Auditoría IA | `GET /api/audit/anomalies`, `GET /api/audit/summary`, `POST /api/audit/resolve-batch` |
| Siniestros (Kanban) | `GET /api/claims/pipeline`, `POST/PUT/DELETE /api/claims`, `PATCH /api/claims/{id}/status` |
| Afiliaciones (stepper) | `POST /api/patients`, `POST /api/patients/{id}/policies`, `POST /api/claims` |
| Pacientes | `GET/PUT/DELETE /api/patients`, `GET/PUT/DELETE /api/patients/{id}/policies` |
| Optimización nube | Datos ilustrativos (sin backend en el MVP) |

## Estructura

```text
src/
  environments/          apiUrl: '/api' en desarrollo, URL del backend en producción
  app/
    core/api/            api.models.ts (espejo de los DTOs Java) y clientes HTTP
    core/auth/           AuthService (sesión JWT en sessionStorage) e interceptor Bearer
    core/state/          ErpStore: estado compartido con signals (la app es zoneless)
    core/ui/             Etiquetas en español, formato y mensajes de error de la API
    features/            auth, overview, audit, claims, enrollment, patient, cloud
```

`api.models.ts` debe coincidir con los records del backend. El backend omite los campos `null` (`non_null`), por eso esos campos son opcionales (`?`) en TypeScript.

## Pruebas y build

```powershell
npm test -- --watch=false    # Vitest: integración HTTP con HttpTestingController
npm run build                # build de producción en dist/
```

## Despliegue

Antes de `npm run build`, configura `apiUrl` en [src/environments/environment.ts](src/environments/environment.ts) con la URL pública del backend, y agrega el dominio del frontend en `FRONTEND_ORIGINS` del backend (CORS). [vercel.json](vercel.json) redirige todas las rutas a `index.html`.
