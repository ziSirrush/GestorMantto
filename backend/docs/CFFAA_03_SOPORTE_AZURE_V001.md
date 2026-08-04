# CFFAA-03 — Soporte sobre Azure Blob Storage

Versión: V001  
Fecha: 2026-08-03  
Base acumulativa: CFFAA-00 + CFFAA-01A/F + CFFAA-02

## Alcance aplicado

- La creación inicial de solicitudes usa `multipart/form-data`.
- Se permiten hasta 5 archivos, 25 MB por archivo y 50 MB por petición.
- Se eliminó la conversión Base64/FileReader del formulario heredado.
- `sup_adjuntos` continúa como tabla funcional única de Soporte.
- La empresa queda persistida en `sup_tickets.empresa` y se toma del propietario de la solicitud, no del actor administrativo que adjunta.
- La creación del ticket y sus metadatos de adjuntos usa transacción SQL y compensación de blobs.
- Las cargas posteriores reutilizan la política y middleware común de CFFAA-01.
- Los listados no exponen contenedor, blob ni ruta interna.
- El acceso se genera bajo demanda mediante SAS.
- Se agregó baja lógica y eliminación física/cola de reintento:
  - `DELETE /api/support/tickets/:id/adjuntos/:idAdjunto`
- Se unificaron los mensajes visuales con el límite real de 25 MB.

## Orden de aplicación

1. Respaldar `sup_tickets` y `sup_adjuntos`.
2. Ejecutar `backend/sql/20260803_CFFAA_03_SOPORTE_AZURE.sql`.
3. Ejecutar `backend/sql/20260803_CFFAA_03_POSTFLIGHT.sql`.
4. Aplicar los archivos del FIX conservando sus rutas.
5. Ejecutar:

```bash
cd backend
npm run check
node scripts/validate-cffaa-01.js
node scripts/validate-cffaa-01ef.js
node scripts/validate-cffaa-02.js
node scripts/validate-cffaa-03.js
```

6. Publicar backend y frontend.

## Pruebas funcionales

1. Crear solicitud sin archivo.
2. Crear solicitud con uno y con varios archivos.
3. Rechazar archivo mayor a 25 MB.
4. Rechazar más de 5 archivos o más de 50 MB totales.
5. Abrir un adjunto desde el detalle.
6. Adjuntar un archivo desde el gestor moderno.
7. Eliminar un adjunto y confirmar su baja en Aiven.
8. Revisar `storage_operaciones_pendientes` si Azure no pudo eliminar físicamente el blob.
9. Confirmar que un usuario ajeno no pueda abrir o eliminar el archivo.
10. Confirmar que un usuario de Soporte guarde el blob bajo la empresa del propietario.

## Rollback

- Revertir los archivos de esta entrega.
- La columna `sup_tickets.empresa` es aditiva y puede conservarse sin afectar el código anterior.
- No eliminar la columna ni el índice hasta confirmar que no existen registros CFFAA-03 dependientes.
- La baja de adjuntos es lógica; no se recomienda reactivar registros cuyo blob ya fue eliminado.

## Nota de dependencias

CFFAA-03 no agrega ni modifica dependencias. En el entorno de generación, `npm ci` no pudo completarse porque el registro npm interno respondió 404 para `@azure/identity`. Además, el `package-lock.json` recibido no contiene las entradas de Azure declaradas en `package.json`; por esta razón CFFAA-03 no afirma que `npm ci` esté resuelto. El FIX conserva `package.json` y `package-lock.json` sin cambios para no alterar una corrección de despliegue fuera de su alcance.
