# FASE 4 - M2M/SYNC instalado en bypass

## Objetivo
Incorporar en la version publicada la infraestructura de autenticacion maquina-a-maquina (M2M/HMAC) y montar guards por identidad sobre las rutas SYNC, **sin activar todavia la exigencia HMAC**.

## Estado requerido en Azure
Mantener:

```text
INTEGRATION_AUTH_ENABLED=false
```

Con esta bandera en `false`, las rutas SYNC normales conservan el comportamiento previo. En los imports historicos de Ventas se conserva expresamente el control legado definido en `whenDisabled` (`requireAuth` + `requireHistoricalSyncEnabled`).

## Archivos incluidos
- `backend/src/middleware/integration-auth.middleware.js`
- `backend/src/modules/instalaciones-drive/instalaciones-drive.routes.js`
- `backend/src/modules/instalaciones-proyecto-drive/instalaciones-proyecto-drive.routes.js`
- `backend/src/modules/portafolio/portafolio.routes.js`
- `backend/src/modules/tickets/tickets.routes.js`
- `backend/src/modules/ventas-clientes/ventas-clientes.routes.js`
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.routes.js`
- `backend/src/modules/ventas-prospeccion/ventas-prospeccion.routes.js`
- `backend/src/modules/ventas-redes/ventas-redes.routes.js`
- `backend/src/routes/ins-fl.routes.js`
- `backend/src/routes/logistica.routes.js`

## Identidades M2M montadas
- Tickets -> `INTEGRATION_TICKETS_ID`
- Portafolio -> `INTEGRATION_PORTAFOLIO_ID`
- INS_FL -> `INTEGRATION_INS_FL_ID`
- Logistica -> `INTEGRATION_LOGISTICA_ID`
- Instalaciones Drive / Proyecto Drive -> `INTEGRATION_INSTALACIONES_DRIVE_ID`
- Ventas -> `INTEGRATION_VENTAS_ID`

## Dependencia ya incorporada en Fase 1
`backend/src/app.js` ya captura el body crudo mediante `raw-body.middleware.js`; por eso no se duplica en este ZIP.

## Comportamiento esperado con el switch en false
- No se exige firma HMAC todavia.
- Tickets, Portafolio, INS_FL, Logistica, Instalaciones Drive y Ventas normales continúan pasando al controller.
- Los imports historicos de Cotizaciones/Prospeccion mantienen su proteccion previa mediante sesion + `CFFAA_HISTORICAL_SYNC_ENABLED`.

## No incluido en esta fase
- Activar `INTEGRATION_AUTH_ENABLED=true`.
- Pruebas HMAC reales.
- Endurecimiento transaccional por registro / SAVEPOINT de Fase 5.
- Replay protection persistente.
- Auditoria persistente M2M.

## Validaciones realizadas al paquete
- Sintaxis `node --check` sobre todos los `.js` incluidos.
- Los guards usan exclusivamente variables M2M ya existentes en la configuracion auditada.
- No se modifican controllers ni logica de negocio.
- No se modifica frontend.

## Validacion requerida despues de aplicar
1. Mantener `INTEGRATION_AUTH_ENABLED=false` en Azure.
2. Reiniciar backend.
3. Verificar `/api/health` y conexion Aiven.
4. Ejecutar al menos un SYNC controlado de cada integracion vigente y confirmar que sigue procesando como antes.
5. No pasar a `true` hasta completar Fase 5 y la validacion previa a Fase 6.
