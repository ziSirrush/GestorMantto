# BLT NOW - Cobranza UNITED - Administracion - MP Fase 6 V001

Fecha: 23/10/2026. Repositorio oficial revisado: `ziSirrush/GestorMantto`, `main`, commit `15c879e6ffa29701006fee74267332d1a29c1b48` (102326.5). La entrega se aplica **sobre Fases MP 1 a 5 ya integradas localmente**, que no figuran en dicho commit remoto. No se hizo escritura en GitHub, Aiven, Azure, Netlify, ni se altero GAS.

## Objetivo y limites

Preparar captura, vinculacion y edicion **por registro** de la tabla existente `detalle_mp_2026_zona_1` sin romper `detalle_mp_2026`, GC, VA ni la sincronizacion GAS activa. F6 habilita **validaciones de lectura** a usuarios con acceso propio de MP.VER + MP.EDITAR. Los endpoints persistentes estan instalados, pero **fallan 403 de manera deliberada** mientras falte el cierre de GC, VA y MP y la autorizacion final.

- La tabla nueva ya existe (128 columnas) y fue comprobada mediante metadatos proporcionados por el usuario; este paquete **no ejecuta ALTER ni CREATE**.
- Regla 1:1: un `id_dmp` solo puede vincular una fila de Zona 1 (restriccion UNIQUE ya aplicada a la BD).
- Se utiliza exclusivamente el `id_dmp` oficial y la PK `id_mp_zona_1`; no existe un BUSCARV por nombre como sustituto de autorizacion.
- El alcance territorial y la identidad del proyecto los aporta el servicio UNITED oficial (`buildCobranzaProjectScopeSql_uni` y `canonicalProjectSql_uni`). Se comprueba el proyecto y cuando corresponde `idns`, `cliente`; **para vincular un registro importado, ambos IDNS deben ser no vacios e identicos**.
- En creacion nueva, los **16 campos generales** se copian desde el registro MP verificado en backend, no desde el cliente. Los **108 campos de los 12 bloques** son candidatos de captura individual. No se recalculan facturas, importe, vencimiento o saldos sin formulas confirmadas.
- `id_mp_zona_1`, `id_dmp`, `created_at`, `updated_at` e identidad del proyecto no son editables por captura; los seis importes/datos que alimentan BUSCARV permanecen sin escritura directa de Zona 1 hasta completar el motor de reconciliacion.
- Las fechas capturadas usan ISO `AAAA-MM-DD` contra MySQL DATE, los enteros cubren el rango INT y los campos VARCHAR respetan su longitud exacta. Se preservan los BIGINT como texto.

## Endpoints previstos

Prefijo: `/api/cobranza-uni/administracion/tablas/detalle_mp_2026/zona-1/:id`.

| Metodo/ruta | Uso | Estado F6 |
|---|---|---|
| POST `/validar-vinculo` | Verificar un `id_mp_zona_1` ya importado y no vinculado. | Solo SELECT, `preview_only` |
| POST `/validar-alta` | Validar captura nueva de uno o varios campos de factura. | Solo SELECT, `preview_only` |
| POST `/validar-cambio/:zonaId` | Validar cambio de una celda con valor original esperado. | Solo SELECT, `preview_only` |
| POST `/vincular` | Vincular la fila importada al MP validado. | 403 con GAS activo |
| POST `/` | Crear fila de Zona 1 heredando 16 generales del MP. | 403 con GAS activo |
| PATCH `/:zonaId` | Editar una factura con concurrencia optimista. | 403 con GAS activo |

Las tres rutas de validacion exigen sesion, guard de Administracion, permiso efectivo `MP.VER` y `MP.EDITAR`, puerta UNITED/COBRANZA_UNI, alcance del proyecto y no estar en visor. Ninguna ruta habilita lectura de facturas de otro proyecto. El GET de F5 conserva su ubicacion y respuesta anteriores.

Las escrituras exigen **todas** las puertas de servidor: `MP_RULES_UNI.zone1WritesEnabled === true`, `MP_RULES_UNI.gasSyncRemainsActive === false`, `MP_RULES_UNI.writesEnabled === true`, `MP_ADMIN_EDIT_ENABLED=true`, `MP_ADMIN_GAS_CUTOVER_CONFIRMED=true`, `MP_ADMIN_GC_VA_MP_RECONCILED=true`, y `MP_ADMIN_ZONA1_WRITE_ENABLED=true`. En F6 las constantes del contrato siguen bloqueadas (`false`/`true` respectivamente), por lo que **poner flags en Azure NO activa la escritura**.

Cuando el corte posterior se autorice, las operaciones preparadas usan una unica transaccion con `FOR UPDATE`, condicion de `id_dmp`, valor esperado para ediciones y auditoria `usuario_interacciones` mediante el mismo ejecutor; todo fallo provoca `ROLLBACK`. La interfaz hara recarga selectiva del detalle tras un guardado confirmado; por ahora solo permite simular.

## Interfaz

- Mantiene la tabla principal, el panel de 16 campos generales, los 12 bloques y el comparativo BUSCARV de F5.
- Si existe `.EDITAR` efectivo y no se usa el Visor de Usuarios, presenta opciones **Validar vinculo**, **Validar captura** y **Validar cambio de factura**. Ninguna llama a la API de escritura en la configuracion actual.
- El modal conserva proteccion de contenido HTML, control de respuestas tardias al cerrarse, interfaz responsive y permisos verificados exclusivamente en backend.

## Pruebas realizadas / pendientes

- **103/103 pruebas locales** (Administracion F1, VA F1 y MP F1 a F6), con Aiven simulado, se ejecutaron correctamente tras componer el proyecto parcial y repetir el suite con los archivos empaquetados.
- F6: **22/22 pruebas** del contrato de 108 campos, validacion de fechas/enteros/BIGINT, bloqueo de GAS, alcance e identidad, vinculacion explicita, conflictos, transacciones simuladas, auditoria/rollback, rutas y GUI.
- `node --check` en JS empaquetado y `git diff --check` de los archivos modificados: conforme a las verificaciones locales.
- **No equivale** a CI del repo entero, ni a una lectura/escritura en Aiven real, ni a prueba E2E. No hay validacion de carga inicial ni reconciliacion de filas importadas. La tabla Zona 1 puede seguir sin registros vinculados.

## Archivos incluidos (solo delta respecto a F5)

**Nuevos:**
- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-zona1-validation.js`
- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-zona1-write-service.js`
- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.mp-zona1-audit.js`
- `tests/cobranza-uni-administracion-mantenimiento-preventivo-fase6.test.js`
- `docs/BLTNOW_MP_ADMIN_FASE6_V001.md` y `README_FASE6_MP.txt`.

**Modificados:**
- `backend/src/modules/cobranza-uni-administracion/cobranza-uni-administracion.routes.js`
- `modules/cobranza-uni/administracion/main/main.js`
- `modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.js`
- `modules/cobranza-uni/administracion/mantenimiento-preventivo/mantenimiento-preventivo.css`
- `tests/cobranza-uni-administracion-mantenimiento-preventivo-fase2.test.js`
- `tests/cobranza-uni-administracion-mantenimiento-preventivo-fase3.test.js`
- `tests/cobranza-uni-administracion-mantenimiento-preventivo-fase4.test.js`
- `tests/cobranza-uni-administracion-mantenimiento-preventivo-fase5.test.js`

Los tests historicos se adaptaron solamente a la incorporacion de PREVIEWS POST de F6 y al nuevo `can_write_zone1` denegado; sus pruebas de lectura, alcance, formula y F5 siguen ejecutandose.

## Siguiente: MP Fase 7

Conciliacion contra datos reales de `mydb` y Sheets, comprobacion de filas huerfanas/duplicados y de reglas de formula, verificaciones de integridad, seguimiento de cambios y preparacion de **decision explicita** para el corte global GC+VA+MP. **No detener GAS ni habilitar escritura automaticamente al concluir F7** sin autorizacion expresa del usuario.
