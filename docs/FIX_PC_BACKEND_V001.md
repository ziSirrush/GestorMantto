# FIX PC BACKEND V001

## Alcance
Backend independiente para sincronizar la tabla `pc`, siguiendo el mismo patrón ya utilizado para `detalle_mp_2026` y la integración de Cobranza United.

## Endpoint
`POST /api/cobranza-uni/pc/sync`

## Autenticación
Reutiliza la misma identidad M2M de Cobranza United:
- `INTEGRATION_COBRANZA_UNI_ID`
- `INTEGRATION_COBRANZA_UNI_SECRET`

No agrega variables nuevas de Azure.

## Llave de BD
`id_pc`

## Comportamiento
- `id_pc` inexistente: INSERT.
- `id_pc` existente con cambios: UPDATE.
- `id_pc` existente sin cambios: UNCHANGED.
- Error individual: REJECTED mediante SAVEPOINT sin abortar el lote completo.
- No elimina registros.
- Las fechas del payload ISO se normalizan a `YYYY-MM-DD` para las columnas DATE de `pc`.

## Archivos nuevos/modificados
- `backend/src/controllers/pc.controller.js` (nuevo)
- `backend/src/routes/pc.routes.js` (nuevo)
- `backend/src/routes/index.js` (modificado para montar la nueva ruta)

## CONFIG de Apps Script
Usar:
`ENDPOINT: '/api/cobranza-uni/pc/sync'`
