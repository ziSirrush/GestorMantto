# CFFAA-02 — Home / Pendientes sobre Azure Blob Storage

Versión: V001  
Estado: Desarrollo / Pruebas  
Proyecto: Mantto Gestor

## Objetivo

Cerrar el ciclo de archivos de Home/Pendientes usando la infraestructura aprobada en CFFAA-00 y CFFAA-01:

- Azure Blob Storage conserva el archivo físico privado.
- Aiven conserva la relación funcional y los metadatos.
- El backend valida el acceso y genera una SAS solo al pulsar **Abrir**.
- Las tablas de otros módulos no se unifican ni se modifican.

## Hallazgos corregidos

- Home enviaba archivos como Base64 dentro de JSON y quedaba limitado por `JSON_LIMIT`.
- `photo_url` y `adjunto_url` no conservaban metadatos suficientes para archivos nuevos.
- El listado y detalle podían depender de enlaces directos en lugar de acceso autenticado.
- Una sustitución o eliminación podía dejar blobs sin limpieza coordinada.
- Los permisos de tareas personales y colaborativas debían verificarse también en backend.
- Las notificaciones de comentarios debían abrir la tarea y posicionar el chat.
- El bootstrap modular real de Home y el listado modular de notificaciones todavía debían adoptar el alcance y la autenticación de CFFAA-02.

## Cambios

### Base de datos

La migración `20260803_CFFAA_02_HOME_PENDIENTES_AZURE.sql`:

- agrega `pendientes.empresa` si no existe;
- realiza un backfill conservador usando la empresa del creador;
- crea `pendientes_archivos`, tabla propia del módulo;
- conserva `photo_url` y `adjunto_url` para compatibilidad histórica;
- no migra automáticamente archivos históricos;
- mantiene las tablas de adjuntos de otros módulos sin cambios.

### Backend

- La creación y edición de tareas recibe `multipart/form-data`.
- Se admite una sola evidencia directa activa: imagen o documento, máximo 25 MB.
- Los comentarios aceptan texto, archivo o ambos.
- Las cargas nuevas usan el contrato general CFFAA-01.
- Si Azure carga y Aiven falla, se intenta eliminar el blob o se envía a la cola técnica.
- Al sustituir evidencia, la anterior se da de baja y se elimina después del `COMMIT`.
- Al eliminar una tarea, se recopilan y limpian sus blobs directos, de comentarios y referencias Azure históricas.
- La lista y el detalle devuelven metadatos y endpoints protegidos, nunca la SAS almacenada.
- Las tareas personales solo son accesibles por su creador.
- Las colaborativas son accesibles por el creador o por usuarios relacionados explícitamente.
- Solo el creador puede editar, eliminar o retirar evidencia directa.
- El autor de una interacción se excluye de sus propias notificaciones.
- Los archivos de comentarios se clasifican con la empresa persistida de la tarea; no se usa la empresa circunstancial del usuario que comenta.
- Si una tarea histórica no tiene empresa resoluble, se permite comentar sin archivo, pero se bloquea el adjunto hasta editar la tarea y definir su empresa.
- El bootstrap modular activo de Home sanitiza referencias internas y valida el esquema antes de consultar `pendientes_archivos`.
- El listado modular de notificaciones exige sesión y aplica el mismo alcance de tareas personales y colaborativas.

### Frontend

- Se retiró `FileReader.readAsDataURL()` de Home.
- Los formularios envían archivos reales mediante `FormData`.
- No se establece manualmente el encabezado `multipart/form-data`.
- El detalle solicita la SAS cuando el usuario pulsa **Abrir**.
- Se muestran metadatos básicos, sustitución y eliminación de evidencia directa.
- Los comentarios permiten texto, archivo o ambos.
- Una notificación de comentario abre la tarea y posiciona directamente el formulario de comentarios.

## Archivos modificados

- `backend/src/controllers/data.controller.legacy.js`
- `backend/src/modules/pendientes/pendientes.routes.js`
- `backend/src/modules/home/home.repository.js`
- `backend/src/modules/home/home.service.js`
- `backend/src/modules/home/home.routes.js`
- `backend/src/modules/notificaciones/notificaciones.service.js`
- `backend/src/modules/notificaciones/notificaciones.routes.js`
- `backend/src/services/storage/storage-metadata.adapters.js`
- `backend/src/services/storage/storage-schema.service.js`
- `backend/scripts/validate-structure.js`
- `core/router.js`
- `modules/home/home.js`
- `styles/home.css`
- `index.html`

## Archivos nuevos

- `backend/src/modules/pendientes/pendientes-access.service.js`
- `backend/src/modules/pendientes/pendientes-files.repository.js`
- `backend/src/modules/pendientes/pendientes-files.service.js`
- `backend/src/modules/pendientes/pendientes-files.controller.js`
- `backend/scripts/validate-cffaa-02.js`
- `backend/sql/20260803_CFFAA_02_HOME_PENDIENTES_AZURE.sql`
- `backend/sql/20260803_CFFAA_02_POSTFLIGHT.sql`
- `docs/CFFAA_02_HOME_PENDIENTES_AZURE_V001.md`

## Orden de aplicación

1. Confirmar respaldo vigente.
2. Ejecutar `backend/sql/20260803_CFFAA_02_HOME_PENDIENTES_AZURE.sql` en Aiven.
3. Ejecutar `backend/sql/20260803_CFFAA_02_POSTFLIGHT.sql`.
4. Confirmar `pendientes.empresa`, la tabla `pendientes_archivos`, índices y tres llaves foráneas.
5. Aplicar los archivos completos del FIX respetando sus rutas.
6. Ejecutar dentro de `backend`:

   ```bash
   npm run check
   node scripts/validate-cffaa-01.js
   node scripts/validate-cffaa-01ef.js
   node scripts/validate-cffaa-02.js
   ```

7. Desplegar backend y frontend.
8. Validar `/api/health` con MySQL conectado.
9. Probar el flujo funcional indicado abajo.

No agrega dependencias ni variables nuevas. CFFAA-00 y CFFAA-01 deben permanecer aplicados.

## Pruebas funcionales mínimas

1. Crear tarea sin archivo.
2. Crear tarea con imagen.
3. Crear tarea con documento.
4. Editar una tarea sin sustituir su evidencia.
5. Sustituir la evidencia y comprobar la baja de la anterior.
6. Eliminar evidencia directa.
7. Enviar comentario sin archivo.
8. Enviar solo archivo.
9. Enviar comentario y archivo.
10. Abrir evidencia directa y adjunto de comentario mediante SAS.
11. Abrir un enlace histórico existente.
12. Confirmar que un usuario ajeno no pueda consultar la tarea ni sus archivos.
13. Eliminar una tarea con archivos y revisar la cola `storage_operaciones_pendientes`.
14. Abrir una notificación de comentario y confirmar el posicionamiento en el chat.

## Validaciones realizadas antes de entregar

- Sintaxis de todos los JavaScript modificados con `node --check`.
- `npm run check`.
- `validate-cffaa-01.js`.
- `validate-cffaa-01ef.js`.
- `validate-cffaa-02.js`.
- Carga de `createApp()` y registro de las rutas de Pendientes.
- Arranque controlado del servidor sin conexión MySQL disponible.
- Integridad interna del ZIP.

No se ejecutó la migración en Aiven ni una carga Azure real desde este entorno. La validación definitiva se realiza después del despliegue, donde el App Service usa Managed Identity. Para pruebas locales de Azure se necesita una credencial local válida, por ejemplo Azure CLI.

## Rollback seguro

Si el código debe revertirse, se recomienda desplegar la versión anterior y **conservar** `pendientes.empresa` y `pendientes_archivos`; son cambios aditivos y eliminarlos podría perder metadatos creados durante las pruebas. No borrar blobs ni filas de forma automática durante un rollback sin conciliación previa.
