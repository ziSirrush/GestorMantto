# FIX Backend Ventas Clientes V002

## Objetivo

Alinear el modulo `ventas-clientes` con la tabla real aprobada, sin las columnas `clave_sync`, `id_cliente_origen` ni `creado`.

## Sincronizacion

Endpoint publico, sin API key ni sesion:

`POST /api/ventas/clientes/sync`

Payload:

```json
{
  "registros": []
}
```

El backend procesa lotes internos de 300 registros.

## Identificacion para INSERT/UPDATE

Como la tabla no tiene ID externo, la coincidencia se realiza con la combinacion normalizada de:

- `nombre_empresa`
- `nombre_contacto`
- `email`
- `telefono`

Si existe coincidencia, actualiza y reactiva el registro. Si no existe, inserta uno nuevo.

## Tabla

No requiere ALTER TABLE. Usa exactamente la estructura aprobada de `ventas_clientes`.

## Archivos modificados

- `backend/src/modules/ventas-clientes/ventas-clientes.repository.js`
- `backend/src/modules/ventas-clientes/ventas-clientes.service.js`

El SQL se incluye solo como referencia de la estructura aprobada; no debe ejecutarse si la tabla ya existe.
