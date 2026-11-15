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

## Cobertura del caso de estudio

*ERP integral para aseguradoras médicas y gestión de pacientes (ACA/Obamacare)*

| Requisito | Dónde se cumple |
| --- | --- |
| Gestionar afiliaciones | *Afiliaciones*: stepper con validación de paciente, plan, prima ($0 con subsidio ACA) y servicios |
| Emitir pólizas | Alta de póliza en la afiliación y CRUD en *Pacientes*; ficha PDF en *Clientes CRM* (CRMID) |
| Seguimiento de siniestros | *Siniestros*: Kanban con historial de estados, prioridades y cola offline idempotente |
| Servicios logísticos del paciente | Servicios asociados al siniestro y a la afiliación (transporte médico, entrega de equipo, coordinación de cuidados) |
| IA: errores de registro en masa | *Auditoría IA*: motor de reglas gRPC (pólizas solapadas, facturación, duplicados, correos y teléfonos) con resolución masiva, y recomendaciones del LLM con datos anonimizados |
| IA: expedientes obsoletos a borrar o archivar | *Optimización nube*: perfil real de pólizas, siniestros y expedientes (mantener, archivar, eliminar, retención legal) y plan priorizado del LLM |
| Retención de datos y costos de nube | Política configurable (archivar a los 12 meses, eliminar a los 7 años, retención legal por siniestros en trámite o anomalías críticas) y ahorro estimado de almacenamiento |

## Vistas

| Vista | Endpoints |
| --- | --- |
| Login / registro | `POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/me` (valida la sesión al recargar) |
| Resumen | Métricas calculadas con pacientes, siniestros y anomalías |
| Auditoría IA | `GET /api/audit/anomalies`, `GET /api/audit/summary`, `POST /api/audit/scan` (motor gRPC), `POST /api/audit/resolve-batch`, `GET /api/audit/ai/status`, `POST /api/audit/ai/insights`, `POST /api/audit/anomalies/{id}/ai-explanation` |
| Siniestros (Kanban) | `GET /api/claims/pipeline`, `POST/PUT/DELETE /api/claims`, `PATCH /api/claims/{id}/status` |
| Afiliaciones (stepper) | `POST /api/patients`, `POST /api/patients/{id}/policies`, `POST /api/claims` |
| Clientes CRM | `GET /api/clients`, `GET /api/clients/{id}/pdf` |
| Pacientes | `GET/PUT/DELETE /api/patients`, `GET/PUT/DELETE /api/patients/{id}/policies` |
| Optimización nube (ADMIN/AUDITOR) | `GET /api/audit/retention`, `POST /api/audit/retention/ai-plan` |

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
    core/workers/        Web Worker, Shared Worker, Service Worker y memoria compartida (ver abajo)
    shared/ui/           componentes reutilizables (app-field-error)
    features/            auth, overview, audit, claims, enrollment, clients, patient, cloud, workers-monitor
```

Las importaciones entre capas usan alias definidos en `tsconfig.json`: `@core/*`, `@shared/*`, `@features/*` y `@env/*`.

## Validación de formularios

- Afiliación, ficha del paciente y registro usan las mismas reglas (`core/validation`), equivalentes a las del backend.
- Cada campo muestra su propio error al salir de él o al pulsar *Continuar*, y el foco va al primer campo inválido.
- Correos sin extensión de dominio (`piedad@gmailcom`) se explican y se ofrece la corrección (`¿Quisiste decir piedad@gmail.com?`).
- Los teléfonos se guardan como `(NNN) NNN-NNNN`; la fecha de nacimiento no puede ser futura ni superar 120 años.
- Si el backend responde 400 con `errors`, el formulario vuelve al paso del campo rechazado y lo marca.

## Clientes CRM

- Lista cada cliente con su **CRMID** (`CRMID-XXXXXXXX`), una descripción breve (plan, aseguradora, prima, ciudad y elegibilidad), contacto, edad, plan médico, prima y ciudad.
- Búsqueda sin tildes por CRM ID, nombre, correo, teléfono, ciudad, aseguradora o plan, y filtros *Prima $0* y *Sin plan*.
- El botón **Ver PDF** abre primero una **vista previa** de la ficha (generada por el backend con `disposition=inline`); desde ahí se descarga (`cliente-CRMID-XXXXXXXX.pdf`) sin volver a pedirla, o se abre en otra pestaña. La petición lleva el token de sesión, por eso se maneja como Blob.
- La ciudad se registra en la afiliación y se puede editar en la ficha del paciente.

## Prima $0

Con los créditos fiscales de la ACA algunos planes quedan en prima cero. La afiliación acepta `0` como prima mensual (solo rechaza valores negativos), lo indica en el formulario y el CRM marca esos clientes con la insignia *Prima $0*.

## Workers y paralelismo (`src/app/core/workers/`)

```text
core/workers/
  protocol/   rpc.ts (mensajes tipados con requestId), worker-rpc-client.ts, rpc-server.ts
  billing/    billing-analytics.worker.ts + núcleo puro (CSV, CIE-10, estadísticas) + servicio
  session/    session-sync.shared-worker.ts + reductor puro (sala de espera y bloqueos) + servicio
  offline/    medical-offline.sw.ts (Service Worker) + protocolo + OfflineService
  vitals/     vital-signs.worker.ts + layout SharedArrayBuffer/Atomics + servicio con fallback
  worker-status.ts  detección de capacidades (crossOriginIsolated, SharedArrayBuffer, …)
```

| Módulo | API del navegador | Uso en el ERP |
| --- | --- | --- |
| Analítica de facturación | Web Worker + `postMessage` tipado (request/response con `requestId`, progreso, transferencia del CSV como `ArrayBuffer`) | Procesa 100.000+ registros RIPS: valida y agrupa CIE-10 por capítulo, estadísticas (media, mediana, p95, desviación), servicio, mes, edad y sexo. Si no hay soporte de Workers, se ejecuta en el hilo principal. |
| Sincronización de sesión | Shared Worker + `MessagePort` | Una sola sala de espera para todas las pestañas (urgentes primero) y bloqueo exclusivo de edición de historias clínicas; las pestañas cerradas liberan sus bloqueos por heartbeat. Sin Shared Worker (p. ej. Chrome Android) funciona solo en la pestaña actual. |
| Resiliencia offline | Service Worker + Cache Storage + IndexedDB + Background Sync | Cache-First para recursos con hash y catálogos CIE-10/medicamentos (`/api/catalogs`), Network-First para la navegación. Sin red, los cambios de estado de siniestros se encolan con su `Idempotency-Key` y se reenvían al volver la conexión. Los datos de pacientes no se guardan en caché. |
| Signos vitales | `SharedArrayBuffer` + `Int32Array` + `Atomics.wait/notify/waitAsync` | ECG simulado a 250 Hz: el hilo principal escribe la ventana en memoria compartida y el worker calcula frecuencia cardiaca, picos R y RMS sin serializar. Si `window.crossOriginIsolated !== true`, usa `postMessage` con transferencia. |

La vista **Monitor de workers** (menú *Sistema*) muestra si `crossOriginIsolated` está activo, las capacidades del navegador, un medidor de FPS del hilo principal y un panel para probar cada worker en vivo.

Medido en Chrome con COOP/COEP: 100.000 registros analizados en el worker en ~175 ms con la interfaz a 60 FPS; el monitor de ECG detecta 71,9 lpm para un ritmo de 72; la ventana de 1.000 muestras tarda ~0,07 ms por memoria compartida frente a ~0,2 ms por `postMessage` (≈3× más rápido).

### Cabeceras para `crossOriginIsolated`

`SharedArrayBuffer` solo está disponible con aislamiento entre orígenes:

- `vercel.json`: `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp` y `Cross-Origin-Resource-Policy: same-origin` en todas las rutas; `medical-offline.sw.js` se sirve con `Cache-Control: no-cache`.
- `angular.json` (`ng serve`): las mismas cabeceras COOP/COEP en desarrollo.
- Recursos de otros orígenes: la API responde con `Cross-Origin-Resource-Policy: cross-origin` y CORS; Google Fonts ya envía CORP.

### Build

- Web Worker y Shared Worker los empaqueta Angular (`new Worker(new URL(...))`, `tsconfig.worker.json`).
- El Service Worker necesita una URL fija en la raíz: `npm run build:sw` lo valida con `tsc -p tsconfig.sw.json` y lo compila con esbuild a `public/medical-offline.sw.js` (ignorado por git). `npm start` y `npm run build` lo ejecutan automáticamente (`prestart`/`prebuild`), también en Vercel.

## Auditoría IA con gRPC

*Ejecutar análisis* llama a `POST /api/audit/scan`. El backend envía pacientes y pólizas por gRPC al microservicio `anomaly-engine` (o al mismo motor en proceso si el microservicio no está disponible), guarda los hallazgos nuevos y la bandeja se recarga. La franja *Último análisis* muestra registros revisados, hallazgos nuevos y conocidos, el motor usado, el número de reglas y la duración.

### Recomendaciones con IA (Groq, Grok, Gemini u OpenRouter)

El panel *Recomendaciones con IA* (`ai-insights-panel.component`) pide a `POST /api/audit/ai/insights` un diagnóstico de las anomalías abiertas. El proveedor lo decide el backend según `AI_API_KEY`; la interfaz muestra su nombre real (`aiProviderLabel`) y el modelo.

- **Reporte estructurado** (`ai-report.component`): resumen, nivel de riesgo (alto, medio o bajo), *Por qué importa*, prioridades numeradas con severidad, tipo de registro y número de casos, acciones con el equipo responsable y controles de prevención. El texto llega limpio del backend (sin HTML, tablas ni códigos internos).
- **Respaldo en Markdown**: si el modelo no devolvió JSON válido, se muestra `content` con `renderMarkdown`, que escapa HTML y admite títulos, listas, tablas, `---` y `<br>` literales.
- **Acciones**: *Generar recomendaciones*, *Regenerar* (`refresh=true`, ignora la caché del backend) y *Copiar* (Markdown al portapapeles). Mientras responde se muestra un esqueleto de carga; el pie indica cuándo se generó, tokens, latencia y si vino de caché.
- **Explicar con IA** en *Comparar registros* usa el mismo reporte en modo compacto (*Cómo corregirlo* con pasos numerados).
- **Errores**: el backend devuelve `ProblemDetail` con `reason` (`NOT_CONFIGURED`, `NO_CREDITS`, `RATE_LIMITED`…); `aiErrorView` muestra el detalle real y una guía para resolverlo.

`api.models.ts` debe coincidir con los records del backend. El backend omite los campos `null` (`non_null`), por eso esos campos son opcionales (`?`) en TypeScript.

## Optimización de nube

`cloud-archive.component` consume `GET /api/audit/retention`: indicadores (registros perfilados, para archivar, para eliminar, ahorro estimado), barra de distribución por decisión, perfil por tipo de registro, reglas aplicadas y la tabla de candidatos con filtros (eliminar, archivar, retención legal). El panel *Plan de retención con IA* es el mismo `ai-insights-panel` en modo `retention`: llama a `POST /api/audit/retention/ai-plan`, que solo envía cifras agregadas al proveedor de IA.

## Animaciones

- Cada vista entra con un desplazamiento suave (`.view-host`), las tarjetas aparecen escalonadas y se elevan al pasar el cursor, y las barras de progreso crecen al cargar.
- `CountUpDirective` (`[appCountUp]`) anima los indicadores hasta su valor con una curva *ease-out*; en pruebas se desactiva con `COUNT_UP_DURATION_MS = 0`.
- El login tiene un fondo con orbes y cuadrícula animados y el contenido entra escalonado; el ítem activo del menú late suavemente.
- Todo se desactiva con `prefers-reduced-motion: reduce`.

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
