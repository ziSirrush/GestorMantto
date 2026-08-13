# FIX DETALLE MP 2026 BACKEND V001

## Alcance
Backend independiente para sincronizar la tabla `detalle_mp_2026`, inspirado en la backend ya validada de `gestion_credito`.

## Endpoint
`POST /api/cobranza-uni/detalle-mp-2026/sync`

## Autenticacion
Reutiliza la misma identidad M2M de Cobranza United:
- `INTEGRATION_COBRANZA_UNI_ID`
- `INTEGRATION_COBRANZA_UNI_SECRET`

No se agregan variables nuevas de Azure.

## Llave de BD
`id_dmp`

## Comportamiento
- `id_dmp` inexistente: INSERT.
- `id_dmp` existente con cambios: UPDATE.
- `id_dmp` existente sin cambios: UNCHANGED.
- Fila invalida o error SQL: REJECTED mediante SAVEPOINT sin abortar el lote completo.
- No elimina registros.

## Archivos nuevos/modificados
- `backend/src/controllers/detalle-mp-2026.controller.js` (nuevo)
- `backend/src/routes/detalle-mp-2026.routes.js` (nuevo)
- `backend/src/routes/index.js` (modificado para montar la nueva ruta)

## Nota
No se modifica `integration-auth.middleware.js` porque esta backend reutiliza `INTEGRATION_COBRANZA_UNI_ID` y `INTEGRATION_COBRANZA_UNI_SECRET`, que ya forman parte de la integracion de Cobranza United.
