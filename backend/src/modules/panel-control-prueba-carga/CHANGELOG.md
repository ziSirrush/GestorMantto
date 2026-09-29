# CHANGELOG

## V001.5 - FIX pre Fase 6: runner central y desktop only - 2026-09-29

- `handleSummary(data)` lee el token efímero del entorno de k6.
- `dispatch`, `runner/heartbeat`, `runner/lease` y `runner-start` conectan la UI con un runner externo sin JWT del operador.
- Servicio externo separado del backend medido, con k6 como proceso hijo, secretos en `env` y sin archivos de resultados.
- Identidad funcional validada contra el login real y permisos efectivos de solo lectura; si falta, el runner no se declara listo.
- Guardas de celular/tablet en UI y rutas humanas; el canal de servicio no recibe ese guard.
- Despacho vencido termina `ABORTADA_SIN_CONFIRMACION` / `INCOMPLETO` con motivo `RUNNER_NO_INICIO`.
- Fases anteriores se conservan como historial; el contrato vigente está en `README.md` y `README_FIX_FASE_5_RUNNER_CENTRAL_DESKTOP_ONLY_PRE_FASE_6_V001.md`.

## V001.3 - Fase 4 control real y metricas vivas - 2026-09-28

- Estado `FINALIZANDO` incorporado al ciclo de ejecución y al bloqueo de prueba simultánea.
- Botón Detener ahora solicita cancelación real al runner; no cierra solo la telemetría.
- Canal runner autenticado por token efímero: `runner-control`, `runner-sample`, `runner-stop-ack`, `runner-abort` y `runner-finish`.
- k6 consulta control periódicamente, confirma ACK y ejecuta `exec.test.abort()` ante orden de cancelación.
- `teardown()` confirma cierre al backend y el backend espera brevemente operaciones HTTP/SQL/pool en vuelo.
- Si el runner no confirma antes del timeout, la sesión termina `ABORTADA_SIN_CONFIRMACION` con integridad `INCOMPLETO`.
- VUs activos enviados por el runner y mostrados separados de requests activos del backend.
- UI etiqueta explícitamente RPS backend y p95 backend.
- Protecciones automáticas configurables por porcentaje 5xx y p95 backend después de un mínimo de requests.
- Endpoints administrativos conservan `requireAuth`; heartbeat del runner usa exclusivamente sesión + token efímero hasheado para no añadir consultas de auth a cada muestra.
- `LOAD_TEST_MAX_VUS` sigue siendo el máximo configurado; no se introduce tope fijo de 200.
- Sin `handleSummary()` todavía; resumen definitivo y reporte quedan para Fase 5.
- Sin tablas ni persistencia.

## V001.2 - Fase 3 runner seguro - 2026-09-28

- Runner k6 externo con catálogo fijo de escenarios de lectura.
- `runner-claim` de un solo uso: la pantalla ya no recibe el token efímero.
- Token del runner almacenado únicamente como hash SHA-256 en RAM.
- Claim/arranque ligados al actor autenticado propietario de la sesión.
- `LOAD_TEST_SINGLE_INSTANCE=true` obligatorio y guard contra workers de Node cluster.
- `LOAD_TEST_ALLOWED_ORIGIN` obligatorio; target externo rechazado.
- Origen productivo versionado en el runner; `TARGET_URL` no puede sobreescribirlo.
- Redirecciones k6 desactivadas globalmente y por request.
- Header de process-instance para detectar tráfico que llegue a otro proceso.
- Launcher PowerShell con captura segura de JWT y limpieza de variables de entorno.
- Identidad operadora separada de identidad funcional de prueba.
- Sin `handleSummary()` todavía; reporte final queda para Fase 5.
- Sin canal de detención real todavía; queda para Fase 4.
- Sin tablas ni persistencia.

## V001.1 - Correcciones pre-Fase 3 - 2026-09-28

- Capacidades desacopladas del bootstrap general del Panel de Control, con timeout de 5 s y fallo aislado.
- Tráfico marcado limitado a `GET`/`HEAD`; mutaciones rechazadas antes de negocio.
- Permisos y propiedad de sesión evaluados contra el actor autenticado; Visor mantiene bloqueo de operaciones.
- Recuperación frontend de sesión vencida por TTL (`404`) sin recargar la página; errores de red conservan sesión/token locales.
- Se conserva íntegra la Auditoría semanal de cambios existente.
- Sin tablas ni persistencia nueva.

## V001 - Fase 2 - 2026-09-28

- Sesiones efímeras en RAM con TTL.
- Una sola sesión activa por servidor.
- Token efímero hasheado en memoria.
- Middleware de telemetría por headers de prueba.
- Contexto AsyncLocalStorage para asociar queries SQL a la sesión correcta.
- Métricas HTTP, Node.js, host, MySQL y pool explícito.
- Colector temporal de queries/fingerprints sin cuerpos ni parámetros sensibles.
- Límites de memoria para muestras y acumuladores.
- UI para preparar, consultar, detener y limpiar la sesión temporal.
- Sin runner k6 todavía y sin persistencia.

## V001 - Fase 1 - 2026-09-28

- Alta del submódulo `panel-control-prueba-carga`.
- Alta del endpoint de capacidades.
- Integración con permisos efectivos existentes.
- Máximo de VUs configurable sin límite duro codificado.
- Sin persistencia de resultados.

## Fase 5 - Reporte final efimero V001
- Se agrega `runner-summary` autenticado con el token efimero del runner.
- El summary se acepta una sola vez por sesion.
- Se agrega timeout configurable `LOAD_TEST_SUMMARY_TIMEOUT_SECONDS`.
- Si el summary no llega, la integridad pasa a `INCOMPLETO` y se genera reporte parcial claramente marcado.
- Se agrega reporte final en texto, solo en RAM, sin BD/archivo/historial.
- Se agrega endpoint autenticado de lectura del reporte.
- Se agregan `handleSummary()` y metricas k6 de solo carga funcional, excluyendo trafico de control.
