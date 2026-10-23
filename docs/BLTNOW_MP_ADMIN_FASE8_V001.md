# BLT NOW — Cobranza UNITED — MP Zona 1 — Fase 8 V001

**Fecha:** 23/10/2026. **Repositorio de referencia:** `ziSirrush/GestorMantto`, `main` SHA `15c879e6ffa29701006fee74267332d1a29c1b48`. MP Fases 1–7 existen en los ZIP anteriores y **no estaban incorporadas en dicho `main`** cuando se revisó. Esta Fase 8 se prepara para aplicar **después** de Fases 1–7 en la copia local; no implica despliegue.

## Objetivo real

Incorporar el **backend receptor del planchado inicial desde Google Sheets a `mydb.detalle_mp_2026_zona_1`** y un GAS independiente para enviarlo por lotes, sin apagar los activadores actuales de GC, VA ni `detalle_mp_2026`. El backend solo inserta filas nuevas en la tabla de 128 columnas; **NO ejecuta `UPSERT`, `UPDATE` ni `DELETE`**, no recalcula importes de MP y no escribe en otras tablas. Reintentos con idéntico contenido se reconocen como `already_imported`, y los cambios sobre filas existentes generan `existing_conflict` sin sobreescritura.

## Entregables y archivo por archivo

| Archivo | Modificación |
|---|---|
| `backend/src/routes/detalle-mp-2026.routes.js` | **Modificado**, conserva GET y `/sync` existentes; agrega POST M2M exclusivo de F8 con HMAC **forzado aun con auth global OFF**. |
| `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-zona1-import-validation.js` | **Nuevo:** contrato estricto de 124 campos de Sheets, valores DATE/INT/DECIMAL/VARCHAR, `id_dmp`, 20 filas/lote. |
| `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-zona1-import-service.js` | **Nuevo:** preview, esquema, identidad oficial, inserción-only por transacción, validación de duplicados, reintentos y ROLLBACK. |
| `scripts/cobranza_uni/BLTNOW_MP_ZONA1_FASE8.gs` | **Nuevo:** script autónomo y manual con HMAC, validación de encabezados, mapeo a Consecutivo, checkpoints y envíos de 20 filas. |
| `tests/cobranza-uni-administracion-mantenimiento-preventivo-fase8.test.js` | **Nuevo:** tests de integración simulada sin Aiven, y contrato GAS. |
| `docs/BLTNOW_MP_ADMIN_FASE8_V001.md` y `README_FASE8_MP.txt` | Guía de operación y aplicación local. |

No se alteran contratos, GUARDS humanos, lógica de edición Fases 3/6, configuración de despliegue, permisos, GAS anterior, estructura SQL ni módulo GC/VA.

## Endpoint nuevo

`POST /api/cobranza-uni/detalle-mp-2026/zona-1/importacion-inicial`

- Exige **SIEMPRE** `requireIntegrationAuthFor('INTEGRATION_COBRANZA_UNI_ID', {alwaysRequireAuth:true, algorithm:'sha256'})` con firma HMAC de `timestamp + "\n" + "POST" + "\n" + path + "\n" + JSON.stringify(body)`.
- Se necesita en Azure `INTEGRATION_COBRANZA_UNI_ID` y `INTEGRATION_COBRANZA_UNI_SECRET` ya usados por Cobranza UNI; F8 no pide sustituirlos. Se **reutiliza** el middleware existente y el `express.json({verify:captureRawBody})` existente.
- JSON: `{ "contract":"MP_ZONA1_INITIAL_V001", "batch_id":"<sha256 de 64 hex>", "mode":"preview|import", "rows":[{"sheet_row":2,"id_dmp":"11","data":{"zona_adm":null,... 124 campos ...}}] }`.
- Cada fila contiene **124 valores** de Sheets (`16` generales + `12 × 9` facturación); los 4 campos técnicos (`id_mp_zona_1`, `id_dmp`, `created_at`, `updated_at`) no vienen en `data`.
- Rechaza encabezados extraños, valores inválidos, identificadores repetidos dentro de lote, IDs fuera de `BIGINT` y más de 20 filas/lote. No acepta una lista de campos incompleta.
- El backend valida esquema: **128 columnas**, FK `detalle_mp_2026(id_dmp)` y UNIQUE `uq_mp_zona1_id_dmp`. Si alguna protección no existe, aborta.
- Resuelve el `id_dmp` explícito contra `detalle_mp_2026`, comprueba `proyecto`, **`idns` obligatorio de ambas partes** y `cliente` cuando ambos tienen dato; requiere la **identidad oficial del proyecto** desde `canonicalProjectSql_uni('mp')`. Nunca enlaza por nombre sin `id_dmp`.
- `mode=preview`: consulta Aiven, informa `ready_to_insert`, `already_imported`, `missing_mp`, `identity_conflict` o `existing_conflict`, sin transacción de escritura ni datos sensibles de facturas en respuesta.
- `mode=import`: por defecto devuelve **403**. Únicamente opera cuando Azure tenga ambos flags `MP_ZONA1_INITIAL_IMPORT_ENABLED=true` y `MP_ZONA1_INITIAL_IMPORT_CONFIRMED=true`. Revalida todo **bajo transacción y FOR UPDATE**, primero analiza las 20 filas y **no inserta ninguna si hay algún conflicto en el lote**; luego inserta nuevas; un fallo revierte el lote íntegro. Si una fila ya existía idéntica, se omite sin modificarla.
- No se crean tablas, índices, procedimientos ni triggers nuevos. La evidencia de cada lote está en logs de Azure (`[MPZ1_F8_IMPORT]`, sin secretos) y `created_at` en la tabla. **No se implanta una auditoría persistente M2M nueva:** `usuario_interacciones` requiere un actor humano válido, el cual una integración GAS no debe suplantar.

## GAS — configuración y uso controlado

**Pegar** el contenido del nuevo archivo `.gs` en un proyecto Apps Script que tenga autorización de lectura del Spreadsheet. Se puede añadir como archivo independiente del proyecto GAS actual; **NO reemplazar funciones ni activadores existentes**. El script solo lee hojas y realiza `UrlFetchApp.fetch`, nunca `setValues/clearContents`.

Registrar **en Propiedades del script** (no dentro del código ni en GitHub):

| Propiedad | Valor |
|---|---|
| `MPZ1_F8_API_BASE_URL` | URL origen HTTPS del backend Azure, **sin** ruta ni `/` final. |
| `MPZ1_F8_SPREADSHEET_ID` | ID del libro con ambas hojas. No requiere copiarlo aquí. |
| `MPZ1_F8_MAIN_SHEET_NAME` | Nombre **exacto** de la hoja MP principal (no fue proporcionado, se configura manualmente). |
| `MPZ1_F8_ZONE_SHEET_NAME` | Opcional; defecto `DETALLE MP 2026 ZONA 1`. |
| `MPZ1_F8_MAIN_HEADER_ROW` / `MPZ1_F8_ZONE_HEADER_ROW` | Opcionales; fila de encabezados, por defecto `1`. |
| `MPZ1_F8_INTEGRATION_ID` | Mismo valor autorizado en Azure como `INTEGRATION_COBRANZA_UNI_ID`. |
| `MPZ1_F8_INTEGRATION_SECRET` | Mismo secreto que `INTEGRATION_COBRANZA_UNI_SECRET`. **Nunca registrar en logs.** |
| `MPZ1_F8_IMPORT_CONFIRM` | **Solo después de autorización:** `AUTORIZO_PLANCHADO_INICIAL_MP_ZONA1`. |

**Proceso:**

1. Confirmar ambos encabezados en las filas configuradas. La hoja MP principal necesita columna **A=Consecutivo, C=PROYECTO, D=ID**; Zona1 tiene exactamente **A:DT (124 columnas)**. El GAS respeta los títulos del contrato de F1, incluidas variaciones documentadas: `FOMA DE PAGO` (bloque 01), `ESTATUS DE FACTURA` (04) y `FECHA DE FACTURA` (07–12).
2. Ejecutar **`MPZ1_F8_ValidarPlanchado()`**. Hace preview sobre Aiven aun con flags de escritura apagados; falla si la pareja `PROYECTO + ID` no es única en la principal o si hay duplicidad en Zona1, si faltan IDs, encabezados o fechas válidas.
3. Corregir discrepancias de identidad y comparar el preview con los totales de Sheets, con fecha y hora de corte documentadas. **No cambiar los registros MP para forzar coincidencias** sin verificación.
4. **Solo con aprobación expresa del responsable**, desplegar el backend en Azure, confirmar respaldo de Aiven, configurar ambos flags de Azure `true` y la propiedad del GAS indicada, y ejecutar **`MPZ1_F8_ImportarPlanchado()`**. Se recomienda hacerlo primero con copia/restauración de laboratorio; el importador no borra datos de producción.
5. Los lotes enviados tienen 20 filas; después de un lote 2xx el GAS guarda `MPZ1_F8_CHECKPOINT_V001` con hash de toda la fuente + offset. Reintentar el mismo snapshot omite filas existentes idénticas. Si cambia Sheets durante un envío parcial, **se detiene** hasta revisar, volver a validar y ejecutar `MPZ1_F8_ResetearCheckpoint()` explícitamente (no modifica Aiven).
6. Verificar en Aiven los totales y filas sin vincular, contrastar con el GET diagnóstico de F7; solo después evaluar las puertas futuras de edición. **No desactivar activadores GAS** durante esta fase.

**Precisiones:** fechas de Sheets se convierten a ISO con la zona horaria del libro; importes numéricos deben tener dos decimales reales como máximo; importes como texto deben usar punto decimal sin separador de miles. **No se interpretan `dd/mm/yyyy` ni montos ambiguos**, para prevenir corrupción silenciosa. Ids se transmiten como texto para conservar la precisión de BIGINT. La importación es **solo inicial**: actualizaciones posteriores requieren un proceso separado aprobado, no este endpoint.

## Resultados técnicos y pendientes

- **141/141 pruebas focalizadas de Node aprobadas en una copia parcial** de F1–F7 con F8: 114 heredadas + 27 nuevas. Mocks de Aiven y GAS; pruebas de seguridad, validación, fechas, HMAC de ruta, transacción/rollback, idempotencia, integridad y no sobrescritura.
- `node --check` correcto en los 3 JavaScript nuevos/modificados y sintaxis equivalente del `.gs` mediante copia temporal a `.js`.
- **No se ha ejecutado** una prueba HTTP real de Azure, un `INSERT` real de Aiven, la lectura del Spreadsheet conectado, un GAS real, un despliegue ni un commit/push remoto. Esto requiere autorización y credenciales operativas; no confundir la prueba local con E2E.
- **Bloqueos esperados:** identidad oficial inconsistente, falta de `IDNS`, proyectos con el mismo nombre+ID, errores de fórmula de Sheets, claves de FK antiguas erróneas, diferencias con filas ya importadas. **No puede confirmarse** que los registros actuales de Sheets pasen todos estos controles sin leer la fuente real.
- Las ediciones humanas de `detalle_mp_2026_zona_1` de F6 permanecen cerradas; F8 únicamente habilita **inserción técnica M2M inicial**, bajo dos puertas de operación diferentes.

**Estado: F8 lista para aplicación LOCAL y preview, no autoriza corte GAS ni inserción productiva hasta las configuraciones y aprobación indicadas.**
