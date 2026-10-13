# Backend - MTBC corporativo

Fecha: 2026-07-15

## Regla implementada

El MTBC se calcula exclusivamente con tickets cuya responsabilidad contiene `BLT`.

Se exponen dos ventanas oficiales:

- `mtbc_anio`: desde el 1 de enero del año actual hasta hoy.
- `mtbc_365`: ventana móvil de 365 fechas, desde hoy menos 364 días hasta hoy inclusive.

Fórmula por equipo:

- Año actual: `días transcurridos desde el 1 de enero / fallas BLT del equipo en el año`.
- U365: `365 / fallas BLT del equipo en U365`.

Cuando no existen fallas BLT, el MTBC se devuelve como `null`.

## Agregacion por proyecto

El MTBC de proyecto es `(días del período × equipos activos con al menos una falla BLT en el período) / total de fallas BLT del proyecto en el período`. No es un promedio simple de MTBC por equipo y no incluye equipos activos sin fallas en el numerador.

## Endpoints nuevos

- `GET /api/indicadores/mtbc/equipos`
- `GET /api/indicadores/mtbc/proyectos`

Ambos soportan paginacion. El endpoint de equipos conserva filtros compatibles de zona, proyecto, supervisor, superintendente y busqueda. El endpoint de proyectos soporta zona y proyecto/busqueda.

## Compatibilidad

- El endpoint compartido con Experimental conserva `mtbc_dias` para no modificar ese módulo. Los módulos productivos presentan únicamente `mtbc_anio` y `mtbc_365`.
- `GET /api/criticidad-corporativa` agrega `mtbc_anio` y `mtbc_365` a sus registros.
- No se eliminaron rutas ni campos existentes.

## Archivos modificados

- `backend/src/controllers/criticos.controller.js`
- `backend/src/routes/data.routes.js`

## Validaciones realizadas

- `node --check` en controlador y rutas.
- Verificacion de exportacion de controladores nuevos.
- Verificacion de consistencia entre rutas y nombres de funciones.
