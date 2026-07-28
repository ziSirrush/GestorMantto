# Ventas - Sincronización de cotizaciones

## Endpoint

`POST /api/ventas/cotizaciones/sync`

Encabezado requerido:

- `Content-Type: application/json`

No requiere `VENTAS_SYNC_KEY` ni el encabezado `x-sync-key`.

Cuerpo:

```json
{
  "registros": [
    {
      "id_cot": 1,
      "nombre_proyecto": "Ekasa",
      "cliente": "",
      "numero_equipos": 0,
      "id_asesor": 77,
      "id_admin": 65
    }
  ]
}
```

El backend procesa internamente bloques de 300 registros usando transacciones y UPSERT por `id_cot_origen`.

## Instalación

1. Ejecutar `sql/20260727_VENTAS_COTIZACIONES_SYNC.sql` si la migración todavía no se ha aplicado.
2. Copiar los archivos conservando sus rutas.
3. Publicar nuevamente el backend.

No es necesario crear ninguna variable `VENTAS_SYNC_KEY` en Railway.

## Respuesta

Devuelve total recibido, insertados, actualizados, rechazados, bloques procesados y detalle de filas rechazadas.
