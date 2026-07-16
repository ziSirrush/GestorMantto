# Backend - MTBC corporativo

Fecha: 2026-07-15

## Regla implementada

El MTBC se calcula exclusivamente con tickets cuya responsabilidad contiene `BLT`.

Se exponen dos ventanas oficiales:

- `mtbc_anio`: desde el 1 de enero del año actual hasta hoy.
- `mtbc_365`: ventana movil desde hoy menos 365 dias hasta hoy.

Formula aplicada tanto a equipos como a proyectos:

`(fecha de la ultima falla BLT - fecha de la primera falla BLT) / (numero de fallas BLT - 1)`

Cuando existe cero o una falla BLT, el MTBC se devuelve como `null`, porque no existe un intervalo promedio calculable.

## Agregacion por proyecto

El MTBC de proyecto usa todas las fallas RESP BLT de los equipos pertenecientes al proyecto, ordenadas dentro de cada ventana temporal. No es un promedio simple de MTBC por equipo.

## Endpoints nuevos

- `GET /api/indicadores/mtbc/equipos`
- `GET /api/indicadores/mtbc/proyectos`

Ambos soportan paginacion. El endpoint de equipos conserva filtros compatibles de zona, proyecto, supervisor, superintendente y busqueda. El endpoint de proyectos soporta zona y proyecto/busqueda.

## Compatibilidad

- El endpoint existente de Equipos Criticos conserva `mtbc_dias` para el periodo dinamico y ahora agrega `mtbc_anio`, `mtbc_365`, `fallas_blt_anio` y `fallas_blt_365`.
- `GET /api/criticidad-corporativa` agrega `mtbc_anio` y `mtbc_365` a sus registros.
- No se eliminaron rutas ni campos existentes.

## Archivos modificados

- `backend/src/controllers/criticos.controller.js`
- `backend/src/routes/data.routes.js`

## Validaciones realizadas

- `node --check` en controlador y rutas.
- Verificacion de exportacion de controladores nuevos.
- Verificacion de consistencia entre rutas y nombres de funciones.
