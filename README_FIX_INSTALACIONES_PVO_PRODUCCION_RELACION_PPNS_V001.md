# FIX INSTALACIONES PVO-PRODUCCION RELACION PPNS V001

Base verificada: `c612c1022112a7915575de18393e5f999d1e781b` - Version 092526.3.

## Cambio
El backend de Detalle de Proyecto relaciona PVO-Produccion por PPNS usando:

`ins_fl.id_proyecto = log_ops.id_ppns`

Si un PPNS tiene varios registros de Logistica, se devuelven todos. `id_log_ops` sigue identificando cada registro individual.

## Archivo modificado
- `backend/src/modules/logistica-produccion/logistica-produccion.repository.js`

## Base de datos
- Sin tablas nuevas.
- Sin columnas nuevas.
- Sin migraciones SQL.
- Sin escrituras a Aiven.

## Validaciones ejecutadas
- `node --check`: OK.
- `node --test tests/instalaciones_pvo_produccion_relacion_ppns_v001.test.js`: 4/4 OK.
- Se verifico que el archivo base coincide exactamente con el blob actual de GitHub main antes del cambio.

No se realizo despliegue, commit ni modificacion en GitHub, Azure o Aiven.
