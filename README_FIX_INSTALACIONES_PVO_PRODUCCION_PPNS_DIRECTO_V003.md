# FIX INSTALACIONES · PVO-PRODUCCION · PPNS DIRECTO V003

Base revisada: `97305df5a234ded0a983febb19e1bcc5d44fd434` — `Version 092526.5`.

## Cambio
Se elimina el requisito `logistica_produccion.id_log_ops IS NOT NULL` del resumen usado por Detalle de Proyecto.

La relacion queda exclusivamente por PPNS:

`ins_fl.id_proyecto = logistica_produccion.ppns`

Por lo tanto, un registro de PVO-Produccion con `ppns` correcto se devuelve aunque `id_log_ops` sea `NULL`.

## Archivo modificado
- `backend/src/modules/logistica-produccion/logistica-produccion.repository.js`

## Aplicacion
Sustituir el archivo backend completo y reiniciar el backend.

No requiere cambios de frontend, SQL ni estructura de BD para este ajuste.

Validacion incluida: sintaxis Node + 4 pruebas estaticas. No se ejecuto contra Aiven ni se desplego.
