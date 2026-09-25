# FIX INSTALACIONES · PVO-PRODUCCION · PPNS DIRECTO V002

Base revisada: `8c1ef3ddb4795cad89f50de23116cbe1cf4c384e` — `Version 092526.4`.

## Cambio
La relacion para Detalle de Proyecto queda directamente por PPNS:

`ins_fl.id_proyecto = logistica_produccion.ppns`

`log_ops` deja de decidir a que proyecto pertenece un registro de PVO-Produccion. `id_log_ops` se conserva para identificar el registro logistico y sus documentos.

## Archivos
- `backend/src/modules/logistica-produccion/logistica-produccion.repository.js`
- `backend/src/modules/logistica-produccion/logistica-produccion.service.js`
- `database/fixes/20260925_fix_logistica_produccion_ppns_directo_v002.sql`
- `validation/fix_instalaciones_pvo_produccion_ppns_directo_v002.test.js`

## Importante
Las altas nuevas ahora guardan `logistica_produccion.ppns`. El SQL incluido completa una sola vez los registros existentes cuyo `ppns` esta NULL/vacio, tomando el PPNS del `id_log_ops` ya asociado. No crea ni modifica estructura de tablas.

Orden recomendado:
1. Respaldar/confirmar BD.
2. Ejecutar `database/fixes/20260925_fix_logistica_produccion_ppns_directo_v002.sql`.
3. Sustituir los dos archivos backend completos.
4. Reiniciar backend y probar un Detalle de Proyecto.

Validacion incluida: sintaxis Node + pruebas estaticas del contrato de relacion. No se ejecuto contra Aiven ni se desplego.
