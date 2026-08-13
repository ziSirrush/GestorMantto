# FIX_COBRANZA_UNI_BACKEND_V001

Base: `JIVMBLT/updated_code` / `main`.

## Objetivo
Crear la backend flexible de Cobranza United para recibir lotes desde Apps Script y sincronizarlos contra `gestion_credito` en Aiven.

## Endpoint

`POST /api/cobranza-uni/sync`

Protegido con `requireIntegrationAuthFor('INTEGRATION_COBRANZA_UNI_ID')`.

## Variables requeridas

Azure / backend:

- `INTEGRATION_COBRANZA_UNI_ID=cobranza-uni-appscript`
- `INTEGRATION_COBRANZA_UNI_SECRET=<mismo secreto guardado en Script Properties>`

Apps Script Property:

- `INTEGRATION_COBRANZA_UNI_SECRET=<mismo secreto de Azure>`

No incluir el secreto real en Git ni en archivos del proyecto.

## Comportamiento flexible

- Entrada: `{ "rows": [...] }`.
- Llave: `id_gc`.
- `id_gc` inexistente: INSERT.
- `id_gc` existente con cambios: UPDATE.
- `id_gc` existente sin cambios: UNCHANGED.
- Fila inválida: REJECTED sin abortar las demás filas del lote.
- Cada fila usa SAVEPOINT dentro de una transacción del lote.
- Todos los campos salvo `id_gc` pueden llegar como `null`.
- No elimina registros que desaparezcan de la fuente.

## Respuesta

Incluye:

- `received`
- `processed`
- `inserted`
- `updated`
- `unchanged`
- `rejected`
- `errors`

## Archivos

Nuevos:
- `backend/src/controllers/cobranza-uni.controller.js`
- `backend/src/routes/cobranza-uni.routes.js`

Modificados:
- `backend/src/middleware/integration-auth.middleware.js`
- `backend/src/routes/index.js`

## Validaciones realizadas

- Sintaxis Node.js con `node --check`.
- Ruta registrada antes de `dataRoutes` para evitar interceptores de routers transicionales.
- Identidad M2M dedicada a Cobranza United.
- Los 28 campos coinciden con la tabla oficial `gestion_credito` definida en esta implementación.


## Cambio V002
- La tabla física usada por el controlador cambia de `cobranza_uni` a `gestion_credito`.
- El endpoint se conserva sin cambios: `POST /api/cobranza-uni/sync`.
- Apps Script no requiere cambios por este renombre.
- Antes de probar, ejecutar en Aiven: `RENAME TABLE cobranza_uni TO gestion_credito;`
