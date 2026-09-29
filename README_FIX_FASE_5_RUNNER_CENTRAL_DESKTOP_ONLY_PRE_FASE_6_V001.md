# FIX Fase 5: runner central y acceso solo desde PC

Estado de avance (Ok = implementado y verificado):

- [x] Ok — `handleSummary(data)` usa el token efímero del entorno y no depende de `setupData`.
- [x] Ok — Backend: despacho, heartbeat, lease atómico, inicio y timeout en RAM.
- [x] Ok — Runner externo: login de identidad de prueba, k6 como proceso hijo y limpieza de secretos.
- [x] Ok — UI: preparar y ejecutar desde PC, sin consola técnica para el usuario.
- [x] Ok — Guardas de móvil/tablet en frontend y rutas humanas del backend.
- [x] Ok — Launcher PowerShell técnico usa el contrato del runner.
- [x] Ok — 67 pruebas de Fases 2–5 y del FIX; 19 JS con `node --check`; `backend npm run check`; `git diff --check`; bloque protegido de Auditoría idéntico al de `HEAD`.
- [ ] Pendiente ajeno al FIX — suite histórica de Auditoría (2 fallos en código/test sin cambios) y `backend npm test` (131/132; expectativa antigua de cache bust en Seguimiento Especial).
- [x] Ok — ZIP, patch y manifiesto de entrega.

La carga real contra Producción queda fuera de este FIX. RUNNER EXTERNO PENDIENTE DE DESPLIEGUE.

## Flujo

1. PC autorizada: la interfaz consulta capacidades y presenta escenario, VUs, duración y `PREPARAR Y EJECUTAR`.
2. Backend: `POST /session` crea la sesión temporal y `POST /session/:id/dispatch` valida `req.user`, permiso efectivo, propiedad, Viewer, instancia única, origen y heartbeat del runner. La sesión sigue `LISTA`.
3. Runner externo: autentica `POST /runner/heartbeat` y `POST /runner/lease` con su secreto de servicio. Lease es atómico dentro del proceso Node único V001 y devuelve un token de 256 bits una sola vez. El backend conserva solo SHA-256.
4. Runner externo: usa `POST /api/auth/login` con `correo` y `pass` de la identidad funcional existente. `GET /runner/test-identity` verifica ID configurado y rechaza permisos efectivos ajenos a lectura.
5. k6: arranca como proceso hijo externo con `shell:false`, argumentos `run` y ruta del script; token efímero y JWT funcional entran solo por `env`. `setup()` confirma inicio mediante `runner-start`. `default()`, `teardown()` y `handleSummary(data)` leen el token desde `__ENV`.
6. Backend: si `runner-start` no llega antes del timeout, termina `ABORTADA_SIN_CONFIRMACION` / `INCOMPLETO`, motivo `RUNNER_NO_INICIO`, y libera la plaza. El resumen sigue siendo único y temporal.

El JWT del operador permanece en su sesión normal de navegador/backend. El runner jamás lo recibe. El catálogo permite solo GET/HEAD y el origen k6 está cerrado al Mantto Gestor versionado. No hay tablas ni archivos de resultados.

## Configuración necesaria para desplegar el runner externo

Backend: `LOAD_TEST_SINGLE_INSTANCE=true`, `LOAD_TEST_ALLOWED_ORIGIN` igual al origen versionado en k6, `LOAD_TEST_RUNNER_SERVICE_TOKEN_SHA256` (hash hexadecimal SHA-256 del secreto de servicio), `LOAD_TEST_READ_ONLY_USER_ID` (ID de una cuenta existente auditada de solo lectura), `LOAD_TEST_RUNNER_HEARTBEAT_TTL_SECONDS=15` y `LOAD_TEST_RUNNER_DISPATCH_TIMEOUT_SECONDS=30`. Si el ingreso HTTPS usa un proxy confiable que sobrescribe `X-Forwarded-Proto`, configurar también `LOAD_TEST_TRUST_PROXY_HTTPS=true`.

Host runner **separado del App Service medido**: Node y k6 instalados por el administrador, `MANTTO_RUNNER_SERVICE_TOKEN` aleatorio de 32 bytes (64 hex o base64url de 43 caracteres), `MANTTO_TEST_EMAIL`, `MANTTO_TEST_PASSWORD`; opcionales `MANTTO_RUNNER_ID` y `MANTTO_K6_PATH`. El secreto plano y credenciales viven en el secret store del host, nunca en repositorio, pantalla o logs. Iniciar una vez `node scripts/load-test/mantto-load-test-runner.service.js` como servicio del host. Si falta k6 o la identidad no valida, el heartbeat informa que la ejecución no está lista.

El launcher técnico conserva `-SessionId` y requiere un host ya provisionado. No forma parte del flujo del Director/Programador. El secreto de servicio no concede permisos funcionales. Todas las rutas humanas requieren autenticación y la detección de móvil/tablet funciona como defensa adicional, no como atestación criptográfica.

Documentación oficial verificada: [ciclo de vida de k6](https://grafana.com/docs/k6/latest/using-k6/test-lifecycle/) y [custom summary](https://grafana.com/docs/k6/latest/results-output/end-of-test/custom-summary/). `handleSummary` recibe solo `data`; el retorno de `setup()` se usa en `default()` y `teardown()`.

## Validación local del FIX

- `node --check` de los 19 JS modificados/nuevos: PASS.
- `node --test` Fases 2–5, UI y runner central: 67/67 PASS.
- `backend npm run check`: PASS.
- `git diff --check`: PASS.
- `node --test tests/fase4_auditoria_static.test.js tests/fase4_auditoria_smoke.js tests/change-audit-generator.test.js`: 5/7 PASS. Los dos fallos son de la suite histórica de Almacén/Auditoría: ruta `POST /auditoria` existente ya en `HEAD` y mock SQL que no simula `archiveRecordByLot`. No se editaron esos archivos.
- `backend npm test`: 131/132 PASS. Una prueba de Seguimiento Especial espera versiones de cache anteriores a los cambios preexistentes de esa área.
- Bloque de Auditoría de `modules/panel-control/panel-control.js`, desde `AUDIT_ZONE` hasta `filteredItems`: contenido idéntico al de `HEAD`.
- Carga real contra Producción: no ejecutada.
