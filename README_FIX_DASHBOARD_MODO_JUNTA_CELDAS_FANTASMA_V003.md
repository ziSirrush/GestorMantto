# FIX Dashboard Instalaciones - Modo Junta Celdas Fantasma V003

## Objetivo
Corregir el acomodo de Edicion Rapida del Dashboard de Instalaciones.

## Cambios
- Se elimina por completo la columna/boton Editar y cualquier lapiz visible dentro de las celdas.
- En Modo Junta, la propia celda autorizada funciona como boton fantasma:
  - reposo: apariencia normal;
  - hover/focus: reaccion visual discreta;
  - click/tap: abre el editor flotante anclado a esa celda.
- En movil no depende de hover: tap abre el mismo editor y el panel se adapta a la parte inferior.
- Se agrega la columna Estatus a TODAS las tablas del reporte, 01-SUS a 08-T, incluso en Modo normal.
- En Modo normal Estatus es solo lectura.
- En Modo Junta Estatus es editable en las 8 secciones, incluido 01-SUS y 08-T.
- Se mantienen los demas campos editables acordados por seccion.

## Alcance
Este fix sigue siendo de interfaz y validacion visual. El editor permite modificar el control local, pero Guardar continua deshabilitado y no ejecuta UPDATE en Aiven.

## Archivos modificados
- index.html
- modules/instalaciones-dashboard/instalaciones-dashboard_cor.js
- modules/instalaciones-dashboard/instalaciones-dashboard_cor.css

## No modificado
- Backend
- SQL
- Permisos
- Modulos congelados
