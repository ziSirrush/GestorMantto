# FIX SOPORTE SOLICITUD OPCIONAL EVIDENCIAS V002

## Problema

La ruta `POST /api/support/tickets/mias` validaba siempre el esquema de `sup_adjuntos`, incluso cuando el usuario no adjuntaba evidencias. Esto podía bloquear la creación de una solicitud de solo texto por una condición exclusiva del almacenamiento de archivos.

## Corrección

La ruta queda en este orden:

1. Autenticación obligatoria.
2. Validación permanente de `sup_tickets`.
3. Procesamiento del formulario multipart, permitiendo cero archivos.
4. Validación de `sup_adjuntos` únicamente cuando `req.files` contiene evidencias.
5. Creación de la solicitud.

## Alcance

Solo se modifica:

- `backend/src/routes/support.routes.js`

No se modifican frontend, Panel de Control, Visor de Usuarios, sincronización silenciosa, alcance comercial, roles, permisos, Aiven ni tablas.

## Compatibilidad

La base acumulativa actual ya contiene `requireStorageSchemaWhenFiles` en `storage-schema.middleware.js`, utilizado por Cotizaciones, Prospección y Asignación a Redes. Este FIX reutiliza el mismo helper sin sustituirlo.

## Validaciones

- `node --check` correcto.
- `npm run check` correcto sobre la base acumulativa.
- Sin archivos: se valida `sup_tickets` y se omite `sup_adjuntos`.
- Con archivos: se validan `sup_tickets` y `sup_adjuntos`.
- Las rutas administrativas y de adjuntos posteriores permanecen sin cambios.

## Despliegue

Desplegar únicamente backend. No requiere SQL.
