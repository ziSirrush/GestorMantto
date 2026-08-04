# FIX Panel Lateral - Permisos por agrupación V001

## Problema encontrado

La resolución de permisos del Panel Lateral comparaba cada botón contra un texto formado por toda la fila del catálogo. Una palabra genérica, por ejemplo `proyectos`, podía coincidir con módulos pertenecientes a otra agrupación. Como consecuencia, permisos efectivos de Ventas podían mostrar botones ajenos a Ventas.

## Cambio aplicado

- La búsqueda de permisos de botones agrupados queda limitada a la agrupación real del botón.
- La identidad del módulo se compara únicamente contra:
  - `modulo_codigo`;
  - `modulo_nombre`;
  - `modulo_ruta_frontend`.
- Se eliminaron coincidencias parciales contra nombres de elementos, subelementos y agrupaciones.
- Los módulos internos `__AGRUPACION_VISUAL_*` quedan excluidos de la resolución de botones.
- El permiso visual de agrupación continúa evaluándose de forma independiente.

## Archivo modificado

- `core/user-viewer.js`

## Archivos no modificados

- Backend y endpoint `/api/panel-control/session-permissions`.
- `index.html`.
- Módulos de Ventas y módulos en Nevera.

## Validaciones realizadas

- Sintaxis JavaScript validada con `node --check core/user-viewer.js`.
- Confirmado que el backend ya entrega `modulo_ruta_frontend`.
- Confirmado que el cambio no altera rutas, controladores, tablas ni `/api/health`.
- ZIP verificado para incluir únicamente el archivo de código modificado y este documento.
