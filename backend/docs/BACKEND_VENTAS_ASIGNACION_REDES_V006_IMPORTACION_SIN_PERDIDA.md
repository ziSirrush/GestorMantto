# Backend Ventas > Asignación a Redes V006

## Objetivo

Corregir la importación histórica para que ninguna fila sea rechazada por valores de catálogo o cotización que no puedan normalizarse.

## Regla

- El valor original del backup se conserva siempre en una columna `*_origen`.
- Cuando existe una coincidencia exacta y única, también se guarda el ID normalizado.
- Cuando no existe coincidencia, el ID queda `NULL`, la fila se inserta y se genera una advertencia.
- Solo se rechazan errores estructurales, como `id_redes` inválido o un fallo real de base de datos.

## SQL requerido

Ejecutar antes de desplegar la backend:

`backend/sql/2026-08-04_ventas_redes_preservar_valores_origen.sql`

Agrega:

- `contacto_via_origen`
- `estado_origen`
- `solicitud_origen`
- `estatus_origen`
- `cotizacion_origen`

## Archivos modificados

- `backend/src/modules/ventas-redes/ventas-redes-sync.service.js`
- `backend/src/modules/ventas-redes/ventas-redes-sync.repository.js`

## Validación esperada

Para 215 filas válidas:

- `processed = 215`
- `rejected = 0`
- `inserted = 215` después de truncar
- `warnings_count` puede ser mayor que cero

Las advertencias no detienen la importación.

## Riesgo conocido

Los valores históricos no resueltos quedan con su llave foránea en `NULL`. Deben normalizarse posteriormente mediante un proceso controlado, usando las columnas `*_origen` como fuente.
