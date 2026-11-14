# ERP Insurance — Frontend

Interfaz Angular 21 + Tailwind CSS 4 del ERP para corredoras de seguros médicos ACA. Consume la API Spring Boot del repositorio [ERP_INSURANCE_backend](https://github.com/Andres8525/ERP_INSURANCE_backend), desplegada en https://erp-insurance-api.onrender.com.

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

También se puede **crear una cuenta** desde la pestaña *Crear cuenta* (correo válido y contraseña de 12 caracteres o más). Las cuentas nuevas tienen rol agente y quedan con la sesión iniciada.

## Vistas

| Vista | Endpoints |
| --- | --- |
| Login / registro | `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me` (valida la sesión al recargar) |
| Resumen | Métricas calculadas con pacientes, siniestros y anomalías |
| Auditoría IA | `GET /api/audit/anomalies`, `GET /api/audit/summary`, `POST /api/audit/scan` (motor gRPC), `POST /api/audit/resolve-batch` |
| Siniestros (Kanban) | `GET /api/claims/pipeline`, `POST/PUT/DELETE /api/claims`, `PATCH /api/claims/{id}/status` |
| Afiliaciones (stepper) | `POST /api/patients`, `POST /api/patients/{id}/policies`, `POST /api/claims` |
| Pacientes | `GET/PUT/DELETE /api/patients`, `GET/PUT/DELETE /api/patients/{id}/policies` |
| Optimización nube | Datos ilustrativos (sin backend en el MVP) |

## Estructura

```text
src/
  environments/          apiUrl: '/api' en desarrollo (proxy), https://erp-insurance-api.onrender.com/api en producción
  app/
    core/api/            api.models.ts (espejo de los DTOs Java), clientes HTTP e interceptores de resiliencia
    core/auth/           AuthService (sesión JWT en sessionStorage) e interceptor Bearer
    core/layout/         navegación lateral y ViewKey
    core/state/          ErpStore: estado compartido con signals (la app es zoneless)
    core/ui/             etiquetas en español, formato y traducción de errores de la API
    core/validation/     reglas de correo, teléfono y fechas compartidas por los formularios
    shared/ui/           componentes reutilizables (app-field-error)
    features/            auth, overview, audit, claims, enrollment, patient, cloud
```

Las importaciones entre capas usan alias definidos en `tsconfig.json`: `@core/*`, `@shared/*`, `@features/*` y `@env/*`.

## Validación de formularios

- Afiliación, ficha del paciente y registro usan las mismas reglas (`core/validation`), equivalentes a las del backend.
- Cada campo muestra su propio error al salir de él o al pulsar *Continuar*, y el foco va al primer campo inválido.
- Correos sin extensión de dominio (`piedad@gmailcom`) se explican y se ofrece la corrección (`¿Quisiste decir piedad@gmail.com?`).
- Los teléfonos se guardan como `(NNN) NNN-NNNN`; la fecha de nacimiento no puede ser futura ni superar 120 años.
- Si el backend responde 400 con `errors`, el formulario vuelve al paso del campo rechazado y lo marca.

## Auditoría IA con gRPC

*Ejecutar análisis* llama a `POST /api/audit/scan`. El backend envía pacientes y pólizas por gRPC al microservicio `anomaly-engine` (o al mismo motor en proceso si el microservicio no está disponible), guarda los hallazgos nuevos y la bandeja se recarga. La franja *Último análisis* muestra registros revisados, hallazgos nuevos y conocidos, el motor usado, el número de reglas y la duración.

`api.models.ts` debe coincidir con los records del backend. El backend omite los campos `null` (`non_null`), por eso esos campos son opcionales (`?`) en TypeScript.

## Pruebas y build

```powershell
npm test -- --watch=false    # Vitest: integración HTTP con HttpTestingController
npm run build                # build de producción en dist/
```

## Rendimiento y disponibilidad

El backend corre en Render free, que suspende el servicio tras ~15 min sin tráfico. La app lo compensa:

- **Despertar al abrir:** al cargar la página se llama a `/actuator/health` (`ServerStatusService`); mientras el usuario escribe sus credenciales, Render ya está arrancando. `index.html` además hace `preconnect` al dominio de la API.
- **Estado visible:** el login y el menú lateral muestran si el servidor está conectando, despertando, listo (con latencia) o sin conexión, con botón de reintento.
- **Keep-alive:** con la app abierta y la pestaña visible se hace ping cada 10 min.
- **Reintentos:** las lecturas (GET) y el login se reintentan ante 0/502/503/504 (1 s y 3 s); las escrituras no, para no duplicar operaciones. Tiempo límite de 90 s por llamada.
- **Recuperación:** si el servidor vuelve tras una caída, los datos se recargan solos.
- **Carga diferida:** auditoría, siniestros, afiliaciones, pacientes y nube se cargan con `@defer`; el bundle inicial bajó de ~456 kB a ~394 kB.

## Despliegue en Vercel

La app está en la raíz del repositorio y [vercel.json](vercel.json) fija instalación (`npm ci`), build (`npm run build`), carpeta de salida (`dist/Erp_Insurance/browser`), redirección de rutas a `index.html` y cabeceras de caché y seguridad.

1. En Vercel: **Add New → Project** e importa `ERP_INSURANCE_fronted`. Deja *Root Directory* en `./`; el resto se toma de `vercel.json`.
2. **Deploy**. La URL queda como `https://<proyecto>.vercel.app`.
3. En Render, en el servicio del backend, define `FRONTEND_ORIGINS=https://<proyecto>.vercel.app,https://*.vercel.app` y guarda (Render redespliega). Sin esto el navegador bloquea las llamadas por CORS.

La URL de la API de producción está en [src/environments/environment.ts](src/environments/environment.ts). El plan gratuito de Render se suspende tras ~15 min sin uso: el login avisa si el servidor tarda en despertar.
