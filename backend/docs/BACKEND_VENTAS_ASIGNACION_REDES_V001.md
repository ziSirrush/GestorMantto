# Backend Ventas - Asignación a Redes V001

Estado: Desarrollo / listo para integrar y probar
Fecha: 2026-08-04

## 1. Objetivo

Implementar la backend modular de **Ventas > Asignación a Redes** usando la arquitectura vigente:

```text
Ruta -> Controller -> Service -> Repository -> Aiven MySQL
```

La implementación cubre registros de Redes, selectores, evidencias principales, comentarios y adjuntos privados en Azure Blob Storage.

## 2. Tablas utilizadas

Las tablas ya fueron creadas previamente en Aiven y este FIX no ejecuta migraciones:

- `ventas_redes`
- `ventas_redes_archivos`
- `ventas_redes_comentarios`
- `ventas_redes_comentarios_adjuntos`
- `catalogo_general`
- `usuarios`
- `ventas_cotizaciones_cor`

Los nombres oficiales de columnas se conservaron sin renombrarlos.

## 3. Catálogos oficiales

- `catalogo_general\Ventas\Tipo Contacto\` -> `ventas_redes.id_contacto_via`
- `catalogo_general\General\Estado\` -> `ventas_redes.id_estado`
- `catalogo_general\Ventas\Soli Red\` -> `ventas_redes.id_solicitud`
- `catalogo_general\Ventas\Estatus Pros\` -> `ventas_redes.id_estatus`

El backend valida que cada ID pertenezca a su ruta exacta y que el catálogo esté activo.

## 4. Reglas implementadas

- Todos los campos funcionales pueden enviarse como `NULL`.
- `created_by` y `updated_by` se toman del usuario autenticado; no se aceptan libremente desde el cliente.
- `fecha_cambio_estatus` cambia únicamente cuando cambia realmente `id_estatus`.
- `id_usuario_asignado` muestra usuario en frontend y guarda `usuarios.id_SB`.
- Solo el grupo comercial con acceso total puede asignar o reasignar.
- `id_cotizacion` solo acepta cotizaciones activas y visibles para el alcance comercial del usuario.
- La baja del registro, evidencias, comentarios y adjuntos es lógica mediante `activo = 0`.
- Imagen 1 e Imagen 2 se guardan como filas de `ventas_redes_archivos` con `orden_archivo = 1` y `orden_archivo = 2`.
- Reemplazar una evidencia reutiliza su fila, compatible con la llave única `(id_redes, orden_archivo)`.
- Los archivos físicos se guardan en Azure Blob Storage privado.
- MySQL conserva únicamente metadata y referencias; no se guarda Base64 ni binarios.
- Los accesos Azure se entregan mediante SAS temporal generada bajo demanda.
- Los enlaces históricos HTTPS guardados en `storage_url` permanecen consultables durante la migración.
- Solo el autor puede editar o eliminar su comentario y agregar adjuntos al mismo.
- La carga parcial fallida ejecuta compensación de blobs ya subidos; si Azure no puede eliminarlos, se usa la cola de reintentos existente.

## 5. Visibilidad comercial

Se reutiliza `ventas-visibility.service.js`:

- Acceso total: todos los registros.
- Acceso limitado: registros creados por el usuario o asignados a asesores dentro de su alcance.
- La huella de creación y actualización conserva al usuario real autenticado.
- El modo visor utiliza al usuario visualizado para calcular el alcance de lectura.

## 6. Rutas agregadas

Prefijo completo: `/api/ventas`

### Selectores y consultas

- `GET /redes/catalogos`
- `GET /redes/usuarios-asignables`
- `GET /redes/cotizaciones-activas`
- `GET /redes`
- `GET /redes/:id`

### Registro principal

- `POST /redes`
- `PUT /redes/:id`
- `PATCH /redes/:id`
- `PATCH /redes/:id/estatus`
- `PATCH /redes/:id/asignacion`
- `PATCH /redes/:id/cotizacion`
- `DELETE /redes/:id`

### Evidencias

- `GET /redes/:id/archivos`
- `POST /redes/:id/archivos`
- `GET /redes/:id/archivos/:idArchivo/acceso`
- `DELETE /redes/:id/archivos/:idArchivo`

Campos multipart:

- `imagen_1`
- `imagen_2`

### Comentarios y adjuntos

- `GET /redes/:id/comentarios`
- `POST /redes/:id/comentarios`
- `PUT /redes/:id/comentarios/:idComentario`
- `PATCH /redes/:id/comentarios/:idComentario`
- `DELETE /redes/:id/comentarios/:idComentario`
- `POST /redes/:id/comentarios/:idComentario/adjuntos`
- `GET /redes/:id/comentarios/:idComentario/adjuntos/:idAdjunto/acceso`
- `DELETE /redes/:id/comentarios/:idComentario/adjuntos/:idAdjunto`

Campo multipart para adjuntos:

- `archivos` (máximo 4 por petición)

## 7. Archivos modificados

```text
backend/.env.example
backend/scripts/validate-structure.js
backend/src/routes/index.js
backend/src/services/storage/storage-metadata.adapters.js
backend/src/services/storage/storage-schema.service.js
```

## 8. Archivos nuevos

```text
backend/src/modules/ventas-redes/ventas-redes.repository.js
backend/src/modules/ventas-redes/ventas-redes.service.js
backend/src/modules/ventas-redes/ventas-redes.controller.js
backend/src/modules/ventas-redes/ventas-redes.routes.js
backend/docs/BACKEND_VENTAS_ASIGNACION_REDES_V001.md
```

## 9. SQL requerido

No se incluye SQL adicional. Las cuatro tablas fueron creadas y confirmadas antes de generar este backend.

Antes del despliegue se debe comprobar que producción conserve exactamente los encabezados oficiales y las llaves foráneas aprobadas.

## 10. Variables de entorno

Base de datos y autenticación existentes:

```env
DB_HOST=
DB_PORT=
DB_USER=
DB_PASSWORD=
DB_NAME=mydb
JWT_SECRET=
```

Azure Blob Storage:

```env
AZURE_STORAGE_ACCOUNT_NAME=
AZURE_STORAGE_BLOB_CONTAINER_NAME=
AZURE_STORAGE_SAS_MINUTES=15
AZURE_STORAGE_MAX_FILE_MB=25
AZURE_STORAGE_DELEGATION_KEY_MINUTES=60
CFFAA_STORAGE_MAX_REQUEST_MB=50
```

No se requieren claves Azure en el repositorio. La integración vigente usa Managed Identity / Microsoft Entra ID.

## 11. Validaciones realizadas

- Sintaxis Node.js de todos los archivos nuevos y modificados.
- Carga completa del router principal.
- Inventario de 24 endpoints del módulo.
- `npm run check` con el módulo agregado al validador estructural.
- Pruebas aisladas del service:
  - creación con campos funcionales nulos;
  - bloqueo de asignación sin acceso total;
  - actualización automática de fecha al cambiar estatus;
  - conservación de fecha cuando el estatus no cambia;
  - compensación de una carga Azure parcialmente fallida.
- Prueba de alineación entre placeholders SQL y parámetros en 31 consultas del repository.

## 12. Validación pendiente en entorno desplegado

No se realizaron escrituras ni cargas reales contra Aiven/Azure desde el entorno de generación. La conexión de prueba a Aiven no pudo resolverse por DNS (`EAI_AGAIN`).

Después del despliegue se debe validar:

1. `GET /api/health`.
2. `GET /api/ventas/redes/catalogos` con sesión válida.
3. Creación de un registro sin archivos.
4. Creación con `imagen_1` y `imagen_2`.
5. Generación de SAS temporal y apertura de evidencia.
6. Cambio de estatus y verificación de `fecha_cambio_estatus`.
7. Asignación con usuario de acceso total y rechazo con usuario limitado.
8. Vinculación de una cotización activa.
9. Comentario con y sin adjuntos.
10. Baja lógica y limpieza/cola compensatoria de Azure.

## 13. Pendientes deliberados

- Script de normalización e importación de las hojas 7 y 8.
- Frontend de Asignación a Redes.
- Mapeo granular definitivo del Panel de Control.
- Notificaciones e interacciones: no se agregaron destinatarios ni eventos sin una regla funcional validada.
- Auditoría histórica detallada: no se inventó una tabla adicional; por ahora se conservan autorías, timestamps y comentarios oficiales.

## 14. Riesgos conocidos

- Si alguna ruta oficial de `catalogo_general` no tiene registros activos, el selector correspondiente regresará una lista vacía.
- Si Azure o las tablas de metadata no están configurados, las rutas multipart y de acceso a archivos responderán con error de disponibilidad; las consultas de registros sin archivo continúan separadas.
- Los enlaces históricos externos dependen de que el proveedor original los mantenga disponibles hasta su migración a Azure.
