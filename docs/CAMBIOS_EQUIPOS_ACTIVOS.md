# Fix Dashboard Call Center - Equipos activos

## Archivo modificado
- `modules/callcenter/callcenter.js`

## Cambio aplicado
Se corrigió la normalización de equipos del portafolio en `mapEquipo()`.

Antes, el campo `activo` dependía de `estado_registro` o `estado`, lo que podía marcar todos los equipos como inactivos aunque su `estatus_servicio` fuera válido.

Ahora un equipo se considera activo cuando:
- No está marcado como inactivo (`inactivo` distinto de 1, sí, true, inactivo o x).
- Su `estatus_servicio` no es `No en Servicio`.

## Secciones corregidas
- Proyectos con más llamadas del período: columna `Equipos activos`.
- U365 por proyecto: columna `Equipos activos` y promedio de llamadas por equipo.

## Alcance
No se modificaron HTML, CSS, backend, rutas ni base de datos.
