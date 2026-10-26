# NS Integration - Receptor V001 (capa de entrada)

**Fecha:** 26/10/2026  
**Fuente del backend:** `ziSirrush/GestorMantto`, rama `main`, commit `0748fb40ea8d5cce6ee0b6cd684fbb40d1e52b95`.  
**Estado:** Código local, no desplegado, sin escritura en base de datos.

## Decisión de arquitectura

Mantener la ruta **NetSuite -> API de Azure -> Aiven MySQL -> BLT NOW**. No hay canal inverso hacia NetSuite ni intermediarios GAS/Google Sheets. No se crea servidor Azure nuevo. El emisor ya creado en NetSuite es `customscript2739`; su secreto declarado es `custsecretbltnow_ns_hmac`, ambos configurados por el usuario.

## Enrutamiento

En la API existente (`/api`) se monta `/integraciones/netsuite/v1`. La identidad técnica se valida usando `requireIntegrationAuthFor('INTEGRATION_NETSUITE_ID', {alwaysRequireAuth:true, algorithm:'sha256'})`. Se incluye `INTEGRATION_NETSUITE_ID` y `INTEGRATION_NETSUITE_SECRET` en el mapa compartido de secretos sin tocar la configuración de las otras identidades.

- `GET /estado` solo retorna disponibilidad de la ruta y autenticación exitosa, **no** disponibilidad del almacenamiento.
- `POST /lotes`, `POST /lotes/:loteId/paginas` y `POST /lotes/:loteId/finalizar` validan formatos compatibles con `BLTNOW_NS_Emisor_MR_V001.js`, pero terminan **503** hasta que exista una persistencia aprobada.
- Nunca se retorna `PUBLICADO` ni `ok:true` en rutas de negocio sin una escritura confirmada. El proceso NetSuite debe permanecer desactivado.

## Validaciones implementadas

Versión del contrato, origen NetSuite, dataset, UUID v4, modo de carga completa, búsqueda, fecha UTC, conteos, páginas, columnas, campos de fila, posiciones, huella SHA-256 y correspondencia de IDs al finalizar. Límite inicial de 300 filas por página, máximo 200 páginas por lote, conforme al emisor entregado.

## Pendientes antes de completar la sincronización

1. Designar búsqueda guardada piloto y dataset; identificar FKs y reglas para no mezclar proyectos.
2. Revisar esquema real y tablas destino actuales en Aiven (la sabana de 07/10/2026 puede estar desactualizada).
3. Si hace falta un staging para lotes y páginas, justificarlo y obtener aprobación explícita **antes** de crear tablas.
4. Implementar recepción duradera, idempotencia por lote/página/hash, transacciones, reintentos y publicación atómica por dataset.
5. Test E2E controlado contra entorno autorizado antes de activar el SuiteScript.

## Riesgos y límites

El módulo **no está listo para publicar datos**. Verificaciones de sintaxis y pruebas unitarias locales no prueban Azure/Aiven. Al integrar esta capa en la rama principal se activará un nuevo punto de entrada autenticado y podría ejecutarse la pipeline de Azure tras un push a `main`; no publicar sin autorización explícita.

**Referencias:** `backend/src/routes/index.js`, `backend/src/middleware/integration-auth.middleware.js`, `backend/src/modules/almacen/almacen.ns-sync-service.js` del commit indicado y constitución del proyecto adjunta.
