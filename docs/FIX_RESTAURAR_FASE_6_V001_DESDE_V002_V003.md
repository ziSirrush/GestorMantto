# FIX RESTAURAR FASE 6 V001 DESDE V002 - V003

## Objetivo
Revertir exclusivamente los cambios introducidos por `FIX_URGENTE_FASE_6_SEPARACION_EMPRESAS_V002` y restaurar los tres archivos a su estado exacto dentro de `FASE_6_PERMISOS_VENTAS_INTEGRACION_V001`.

## Archivos restaurados
- `modules/panel-control/panel-control.js`
- `backend/src/middleware/ventas-cotizaciones-permissions.middleware.js`
- `backend/src/controllers/panel-control.controller.js`

## Alcance
- No incluye SQL.
- No modifica datos de Aiven.
- No cambia usuarios, roles, empresas, `rol_permisos` ni `usuario_permisos`.
- No modifica otros módulos de la Fase 6.

## Aplicacion
Sobrescribir los tres archivos en el proyecto con los incluidos en este FIX y desplegar frontend/backend segun corresponda.

## Nota sobre el log compartido
El log muestra que el backend inicia y queda escuchando en el puerto 8080. Tambien muestra un error independiente por ausencia de la tabla `sistema_permisos_dispositivo`; este rollback no crea ni modifica esa tabla.
