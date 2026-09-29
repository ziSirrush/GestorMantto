# Panel de Control - Prueba de Carga

## Contrato vigente: FIX Fase 5 pre Fase 6 (2026-09-29)

El usuario autorizado en PC selecciona escenario, VUs y duración y pulsa **PREPARAR Y EJECUTAR**. La pantalla crea una sesión en RAM y llama `POST /session/:id/dispatch` con su sesión normal. El backend valida `req.user`, permiso `EJECUTAR`, propiedad, modo Visor, instancia única, origen y disponibilidad del runner.

Un proceso **externo** al backend medido ejecuta `scripts/load-test/mantto-load-test-runner.service.js`. Usa `POST /runner/heartbeat` y `POST /runner/lease` con secreto de servicio SHA-256; lease entrega una vez el token efímero y conserva solo su hash. k6 recibe ese token y el JWT de una identidad de prueba de solo lectura en el entorno del proceso hijo. `setup()` llama `POST /session/:id/runner-start` con token efímero; `handleSummary(data)` utiliza el mismo token del entorno para `runner-summary`. El JWT del operador no sale del flujo navegador/backend.

Las rutas humanas tienen `desktopOnly` y `requireAuth`; móviles y tablets detectados reciben 403 `LOAD_TEST_DESKTOP_ONLY`. El canal del runner no tiene guard de dispositivo. Un despacho que no inicia antes de `LOAD_TEST_RUNNER_DISPATCH_TIMEOUT_SECONDS` termina `ABORTADA_SIN_CONFIRMACION`, `INCOMPLETO`, `RUNNER_NO_INICIO` y libera la única plaza activa.

Configuración backend: `LOAD_TEST_SINGLE_INSTANCE=true`, `LOAD_TEST_ALLOWED_ORIGIN`, `LOAD_TEST_RUNNER_SERVICE_TOKEN_SHA256`, `LOAD_TEST_READ_ONLY_USER_ID`, `LOAD_TEST_RUNNER_HEARTBEAT_TTL_SECONDS=15`, `LOAD_TEST_RUNNER_DISPATCH_TIMEOUT_SECONDS=30`. Si el ingress HTTPS está tras un proxy confiable que sobrescribe `X-Forwarded-Proto`, configurar `LOAD_TEST_TRUST_PROXY_HTTPS=true`. Configuración secreta del host runner: `MANTTO_RUNNER_SERVICE_TOKEN` (32 bytes aleatorios en hex o base64url), `MANTTO_TEST_EMAIL`, `MANTTO_TEST_PASSWORD`; opcionales `MANTTO_RUNNER_ID`, `MANTTO_K6_PATH`. El usuario de prueba debe existir previamente y no tener permisos efectivos de escritura. No se crean usuarios, tablas ni archivos de resultados.

**RUNNER EXTERNO PENDIENTE DE DESPLIEGUE.** Ninguna prueba real de carga contra Producción forma parte de este FIX. La detección de dispositivo es defensa operacional; autenticación y permisos siguen siendo obligatorios.

### Historial de Fases 2–4 (contratos anteriores sustituidos)

## Fase 4

Fase 4 agrega **control real de ejecución y métricas vivas del runner** sobre la sesión efímera de Fases 2–3.

Incluye:

- registro temporal en RAM;
- una sola prueba activa `LISTA` / `EJECUTANDO` / `FINALIZANDO` por servidor;
- runner k6 externo con `runner-claim` de un solo uso;
- token del runner almacenado únicamente como SHA-256;
- origen cerrado y redirecciones desactivadas;
- requisito V001 de una sola réplica / un solo proceso backend;
- canal de control runner -> backend autenticado por token efímero;
- orden de cancelación backend -> runner consultada periódicamente;
- ACK de cancelación antes de `exec.test.abort()`;
- cierre del runner con espera breve de operaciones en vuelo;
- muestras temporales de VUs activos reales reportados por k6;
- métricas separadas de VUs objetivo, VUs activos k6, requests activos backend, RPS backend y p95 backend;
- protecciones automáticas configurables por 5xx y p95 backend;
- estado `FINALIZANDO` que bloquea nuevas iteraciones y otra prueba simultánea;
- cierre sin confirmación marcado `ABORTADA_SIN_CONFIRMACION` / `INCOMPLETO`;
- cero persistencia en MySQL, archivos o almacenamiento web.

`200` VUs continúa siendo solo la meta inicial de validación. El límite operativo lo define `LOAD_TEST_MAX_VUS` y no existe un tope fijo de 200 en código.

## Estados de ejecución

```text
LISTA
  -> EJECUTANDO
       -> FINALIZANDO
            -> ABORTADA_MANUAL
            -> ABORTADA_AUTOMATICA
            -> ABORTADA_RUNNER
            -> ABORTADA_SIN_CONFIRMACION
       -> FINALIZADA
```

`FINALIZADA` y los estados `ABORTADA_*` todavía quedan con integridad `PENDIENTE_RESUMEN`, salvo `ABORTADA_SIN_CONFIRMACION`, que queda `INCOMPLETO`. El resumen definitivo y la clasificación final del reporte corresponden a Fase 5.

## Endpoints administrativos

Requieren autenticación normal de Mantto Gestor, permisos efectivos contra el **actor autenticado** y propiedad de sesión cuando aplica:

```text
GET    /api/panel-control/prueba-carga/capabilities
POST   /api/panel-control/prueba-carga/session
GET    /api/panel-control/prueba-carga/session/:id
POST   /api/panel-control/prueba-carga/session/:id/runner-claim
POST   /api/panel-control/prueba-carga/session/:id/start
POST   /api/panel-control/prueba-carga/session/:id/stop
DELETE /api/panel-control/prueba-carga/session/:id
```

El modo Visor continúa bloqueando las operaciones administrativas de escritura.

## Endpoints del canal del runner

Estos endpoints **no usan el JWT del Programador general en cada heartbeat**. Se autorizan exclusivamente mediante el token efímero de 256 bits obtenido por `runner-claim`, cuyo valor plano solo vive en memoria del runner y cuyo hash vive en RAM del backend:

```text
GET  /api/panel-control/prueba-carga/session/:id/runner-control
POST /api/panel-control/prueba-carga/session/:id/runner-sample
POST /api/panel-control/prueba-carga/session/:id/runner-stop-ack
POST /api/panel-control/prueba-carga/session/:id/runner-abort
POST /api/panel-control/prueba-carga/session/:id/runner-finish
```

El subrouter aplica `requireAuth` explícitamente a cada endpoint administrativo. Los endpoints del canal runner quedan fuera de `requireAuth` para no añadir consultas de autenticación/roles a cada heartbeat y se protegen con sesión + token efímero hasheado.

## Flujo de detención manual

```text
Usuario pulsa DETENER PRUEBA
        |
        v
POST /session/:id/stop
        |
        v
FINALIZANDO + cancelRequestedAt
        |
        v
runner-sample / runner-control => command=ABORT
        |
        v
runner-stop-ack
        |
        v
exec.test.abort(...)
        |
        v
teardown()
        |
        v
runner-finish
        |
        v
espera breve de requests/SQL/pool en vuelo
        |
        v
ABORTADA_MANUAL
```

Al entrar en `FINALIZANDO`, nuevas solicitudes funcionales marcadas ya no son admitidas por el middleware de carga. Las operaciones que ya estaban en vuelo pueden terminar y contabilizarse durante la ventana de drenaje.

Si el runner no confirma el cierre antes de `LOAD_TEST_FINALIZATION_TIMEOUT_SECONDS`, la sesión pasa a `ABORTADA_SIN_CONFIRMACION` con integridad `INCOMPLETO` y queda liberada para permitir una nueva prueba. El tráfico funcional marcado que llegue durante `FINALIZANDO` recibe una señal de detención para que cualquier VU pueda abortar la prueba.

## Abortos automáticos

Fase 4 incorpora protecciones del backend configurables:

```text
LOAD_TEST_PROTECTION_MIN_REQUESTS
LOAD_TEST_PROTECTION_5XX_PERCENT
LOAD_TEST_PROTECTION_P95_MS
```

Después del mínimo de requests de la ventana reciente, el backend puede solicitar cancelación automática si alcanza los umbrales configurados de errores HTTP 5xx o p95 backend. La ventana se configura con `LOAD_TEST_LIVE_WINDOW_SECONDS` (10 segundos por defecto). Estos umbrales son mecanismos de protección, no una calificación del rendimiento.

El runner también puede notificar un aborto propio, por ejemplo ante redirección, mismatch de instancia o fallos de red consecutivos.

## Métricas en vivo

Se mantienen separadas por fuente:

```text
VUs objetivo             -> configuración de la sesión
VUs activos k6           -> exec.instance.vusActive enviado por runner
Máx. VUs activos k6      -> máximo de muestras recibidas
Requests activos backend -> middleware Express
RPS backend (10 s)       -> requests completadas en la ventana reciente / segundos observados
p95 backend (10 s)       -> latencias recientes medidas por Express
```

No se presentan requests HTTP activos como si fueran VUs. El reporte final conserva el promedio de RPS y los percentiles globales del backend.

Las muestras del runner son temporales y limitadas en RAM. El p95 definitivo visto por k6 y el resumen final todavía **no** se reciben en Fase 4; pertenecen a Fase 5 mediante `handleSummary()`.

## Runner externo

Archivos:

```text
scripts/load-test/mantto-gestor-load-test.config.js
scripts/load-test/mantto-gestor-load-test.k6.js
scripts/load-test/iniciar-mantto-load-test.ps1
```

El launcher se invoca únicamente con el `session-id`, que no es un secreto:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\load-test\iniciar-mantto-load-test.ps1 -SessionId "LOAD-..."
```

Los JWT se solicitan con `Read-Host -AsSecureString`; no forman parte de la línea de comandos, no se imprimen y no se escriben en archivos.

Durante la ejecución, VU 1 publica periódicamente las métricas del runner y consulta la orden de control. Si recibe `ABORT`, confirma el ACK y llama `exec.test.abort(...)`. `teardown()` intenta confirmar el cierre al backend mediante `runner-finish`.

## Target y método cerrados

El runner solo opera contra el origen exacto autorizado por `LOAD_TEST_ALLOWED_ORIGIN`. Las rutas funcionales proceden del catálogo fijo y solo usan `GET`/`HEAD`.

Toda solicitud funcional marcada lleva:

```text
X-Mantto-Load-Test
X-Mantto-Load-Test-Token
X-Mantto-Load-Test-Instance
```

Las redirecciones siguen desactivadas globalmente y por request.

## Una sola instancia / una sola prueba

V001 exige:

```text
LOAD_TEST_SINGLE_INSTANCE=true
```

Además bloquea workers de Node `cluster` y valida el identificador del proceso que creó la sesión.

Mientras exista una sesión `LISTA`, `EJECUTANDO` o `FINALIZANDO`, otra preparación responde conflicto. Al quedar en un estado terminal o expirar, puede iniciarse otra prueba.

## Variables de entorno de Fase 4

```text
LOAD_TEST_RUNNER_CONTROL_POLL_MS=1000
LOAD_TEST_FINALIZATION_TIMEOUT_SECONDS=20
LOAD_TEST_DRAIN_TIMEOUT_SECONDS=5
LOAD_TEST_PROTECTION_MIN_REQUESTS=30
LOAD_TEST_PROTECTION_5XX_PERCENT=10
LOAD_TEST_PROTECTION_P95_MS=5000
```

Se mantienen las variables anteriores, incluidas `LOAD_TEST_MAX_VUS`, `LOAD_TEST_ALLOWED_ORIGIN` y `LOAD_TEST_SINGLE_INSTANCE`.

## Persistencia

No crea tablas ni guarda resultados. Reiniciar Node elimina todas las sesiones y telemetría temporal.

## Pendiente para Fase 5

Fase 4 **no** implementa todavía:

- `handleSummary()`;
- recepción única del resumen definitivo de k6;
- p95/latencias finales vistas por k6;
- reporte final `COMPLETA` / `INCOMPLETA`;
- botón `Copiar reporte` con contrato final.

## Fase 5 - resumen y reporte

La sesion terminal espera `handleSummary()` de k6 durante `LOAD_TEST_SUMMARY_TIMEOUT_SECONDS`.
El runner envia el resumen mediante `X-Mantto-Load-Test-Token`; el backend conserva solo el hash del token.
El resumen se acepta una sola vez. Al recibirse, la integridad queda `COMPLETO` y se construye el reporte de texto en RAM.
Si no llega dentro del plazo, la integridad queda `INCOMPLETO` y el reporte usa solo las metricas realmente disponibles del backend, sin inventar valores k6.
El reporte se elimina con la sesion por `Limpiar`, TTL o reinicio de proceso.
