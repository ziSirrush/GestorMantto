# Fix Movimientos de Portafolio V0.2

## Objetivo
Alinear el módulo **Movimientos de Portafolio** con la lógica original de Desarrollo.

## Fuente de datos correcta
No se crea tabla nueva. El módulo usa la tabla `portafolio` y compara:

- `estatus_servicio` = estatus actual.
- `estatus_ul_mes` = estatus del último corte mensual.
- `estatus_ul_mes_fecha` = fecha del corte mensual.

## Cambios aplicados

### Frontend
Archivo modificado:

- `pruebas/modules/movimientos-portafolio/movimientos-portafolio.js`

Cambios:

- Mantiene el consumo preferente de `/api/portafolio/movimientos`.
- Agrega fallback seguro a `/api/portafolio` si el endpoint de movimientos no está disponible o devuelve respuesta no JSON.
- Calcula movimientos comparando `estatus_servicio` contra `estatus_ul_mes`.
- Clasifica movimientos:
  - `DEGRADADO`: de En Servicio a otro estatus.
  - `RECUPERADO`: de otro estatus a En Servicio.
  - `CAMBIO`: cualquier otro cambio de estatus.
- Agrega `id_portafolio` al detalle del movimiento para facilitar pruebas.

### Backend
Archivo modificado:

- `backend/src/controllers/data.controller.js`

Cambio:

- El endpoint `/api/portafolio/movimientos` ahora también devuelve `id_portafolio`.

## Nota de prueba
Para probar, cambiar manualmente algunos equipos:

```sql
UPDATE portafolio
SET estatus_servicio = 'No en Servicio'
WHERE id_portafolio IN (2975, 2976, 2977);
```

Si `estatus_ul_mes` sigue en `En Servicio`, el módulo debe mostrar esos equipos como `DEGRADADO`.
