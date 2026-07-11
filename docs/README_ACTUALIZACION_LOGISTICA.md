# Actualizacion backend - Logistica y relaciones administrativas

Archivos incluidos:

- `server.js`
- `src/controllers/logistica.controller.js`
- `src/routes/logistica.routes.js`
- `src/controllers/usuarios-rel-admin.controller.js`
- `src/routes/usuarios-rel-admin.routes.js`

## Rutas agregadas

### Logistica

- `POST /api/logistica/sync`
- `GET /api/logistica`
- `GET /api/logistica/:id`

El endpoint de sincronizacion acepta `id_log_ops` o `id_Script` y realiza:

- INSERT si el ID no existe.
- UPDATE si existe y cambia cualquier campo.
- Sin escritura si la fila es identica.

Tambien mapea los encabezados de Sheets:

- `fecha_almacen` -> `fecha_entrada_almacen`
- `fecha_fin_almacen` -> `fecha_salida_almacen`
- `estatus_sem_pasada` -> `estatus_corte_anterior`
- `fecha_corte` -> `fecha_corte_anterior`

### Relaciones asesor-administrador

- `GET /api/usuarios-rel-admin`
- `POST /api/usuarios-rel-admin`
- `DELETE /api/usuarios-rel-admin/:id`

Estas rutas requieren autenticacion.
