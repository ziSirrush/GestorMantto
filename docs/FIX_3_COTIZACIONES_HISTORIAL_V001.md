# FIX 3 — Cotizaciones: historial y ajuste SQL de dispositivos

Fecha: 2026-08-03  
Estado: listo para pruebas

## Objetivo

Corregir el error 500 al actualizar el estatus de una cotización, alineando el backend con la estructura real de `ventas_cotizaciones_historial` incluida en `Dump20260803.sql`.

También incorpora el ajuste pendiente del FIX 1 para agregar la llave foránea de `usuarios_dispositivos.id_usuario` cuando la tabla ya existe.

## Archivos modificados

- `backend/src/modules/ventas-cotizaciones-historial/ventas-cotizaciones-historial.repository.js`
- `backend/src/modules/ventas-cotizaciones-historial/ventas-cotizaciones-historial.service.js`
- `backend/src/modules/ventas/ventas-visibility.service.js`
- `database/FIX_1_PUSH_DEVICE_PERMISSIONS_V002.sql`

## Correcciones

### Historial de cotizaciones

El código anterior intentaba insertar y consultar columnas inexistentes:

- `accion`
- `detalle_anterior`
- `detalle_nuevo`
- `proxima_fecha`
- `ip`
- `user_agent`

Ahora usa las columnas reales:

- `estatus_anterior`
- `estatus_nuevo`
- `fecha_movimiento`
- `motivo`
- `comentario`
- `campo_origen`
- `valor_anterior`
- `valor_nuevo`
- `id_usuario`
- `iniciales_usuario`
- `origen_movimiento`
- `activo`

Las consultas conservan aliases de compatibilidad (`accion`, `detalle_anterior`, `detalle_nuevo`) para no romper consumidores existentes.

### Acceso total Ventas

Se corrigen los IDs:

```js
const FULL_ACCESS_ROLE_IDS = new Set([1, 4, 34, 39]);
```

Los nombres permanecen normalizados en minúsculas porque el servicio elimina acentos, recorta espacios y aplica `toLowerCase()`.

### Ajuste SQL del FIX 1

La versión V002:

1. Detecta registros huérfanos en `usuarios_dispositivos`.
2. Agrega `fk_usuarios_dispositivos_usuario` si no existe y no hay huérfanos.
3. No elimina datos automáticamente.
4. Mantiene la creación de `sistema_permisos_dispositivo` y la relación Push por dispositivo.

## Orden de aplicación

1. Respaldar la base de datos.
2. Ejecutar `database/FIX_1_PUSH_DEVICE_PERMISSIONS_V002.sql` en Aiven.
3. Revisar el resultado de la consulta de registros huérfanos.
4. Publicar los tres archivos backend.
5. Reiniciar el backend.
6. Probar una cotización con cambio de estatus.
7. Confirmar que se creó un registro en `ventas_cotizaciones_historial`.

## Prueba SQL sugerida

```sql
SELECT *
FROM ventas_cotizaciones_historial
WHERE id_cotizacion = 1669
ORDER BY fecha_movimiento DESC, id_historial DESC;
```
