# Ventas - Sincronización de cotizaciones

## Endpoint

`POST /api/ventas/cotizaciones/sync`

Encabezados requeridos:

- `Content-Type: application/json`
- `x-sync-key: <VENTAS_SYNC_KEY>`

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

1. Ejecutar `sql/20260727_VENTAS_COTIZACIONES_SYNC.sql`.
2. Copiar los archivos conservando sus rutas.
3. Agregar en Railway la variable `VENTAS_SYNC_KEY` con una clave larga y privada.
4. Publicar el backend.

## Respuesta

Devuelve total recibido, insertados, actualizados, rechazados, bloques procesados y detalle de filas rechazadas.
