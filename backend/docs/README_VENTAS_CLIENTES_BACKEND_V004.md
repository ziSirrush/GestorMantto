# FIX Backend Ventas Clientes V004

## Cambio

El endpoint `POST /api/ventas/clientes/sync` queda en modo importacion inicial:

- Cada fila valida ejecuta `INSERT`.
- No busca coincidencias.
- No ejecuta `UPDATE`.
- Permite repetir nombre de empresa, contacto, correo, telefono, ciudad o asesor.
- El contador `actualizados` siempre sera `0` durante este sync.

Las operaciones normales del modulo (`POST`, `PUT`, `PATCH`, `DELETE`, consultas y catalogos) no se modificaron.

## Antes de una recarga completa

```sql
TRUNCATE TABLE ventas_clientes;
```

## Resultado esperado

- `insertados`: total de registros validos.
- `actualizados`: 0.
- `rechazados`: solo registros que incumplan validaciones obligatorias, por ejemplo `nombre_empresa` vacio.
