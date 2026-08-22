# HOME H1 - Interacciones generales V001

## Objetivo
Convertir **Home > Últimas 5 interacciones** en un historial personal general y navegable, usando exclusivamente la tabla Aiven `usuario_interacciones` ya creada y aprobada para H1.

## Fuente H1
H1 queda referenciado a `usuario_interacciones`. No usa `auth_audit` y este paquete no contiene SQL ni cambios de estructura.

Campos consumidos/escritos por H1: `id_usuario`, `tipo_interaccion`, `modulo`, `entidad`, `id_referencia`, `titulo`, `descripcion`, `empresa_contexto`, `ruta_destino`, `payload_json`, `detalle_json`, `metodo_http`, `endpoint`, `ip_address`, `user_agent`, `created_at`.

## Qué registra
- Navegación real del Router: abrir/regresar/refrescar vistas, conservando `ruta_destino + payload_json`.
- Consultas puntuales abiertas por el usuario que no cambian de ruta, cuando corresponden a un recurso identificable.
- Acciones HTTP exitosas `POST`, `PUT`, `PATCH` y `DELETE` realizadas sobre la API: crear, editar, actualizar, comentar, cambiar estatus/prioridad, asignar, Vo.Bo., adjuntar y eliminar.
- Las acciones de negocio se registran desde backend después de una respuesta 2xx. El frontend no puede fabricar acciones de negocio; su POST directo a `/api/interacciones` se limita a `NAVEGACION` y `CONSULTAR`.

## Qué NO registra automáticamente
- Lecturas automáticas de listas/bootstrap.
- Jobs o procesos sin usuario autenticado.
- Sync/import automáticos.
- Operaciones técnicas de Push, permisos de dispositivo, autenticación y apertura de notificaciones.
- Cuerpo de formularios, contraseñas, tokens o payloads de negocio completos.

## Home
- `GET /api/home/snapshot` toma `actividad_reciente` de `usuario_interacciones`.
- El rail **Últimas 5 interacciones** consulta las cinco más recientes del usuario y cada fila regresa a la ruta/payload guardados.
- **Ver todo** (`activity`) muestra el historial personal con paginación de 100 registros.

## Archivos modificados/nuevos
- `backend/src/app.js`
- `backend/src/middleware/interaction-tracking.middleware.js` (nuevo)
- `backend/src/modules/home/home.repository.js`
- `backend/src/modules/home/home.service.js`
- `backend/src/modules/interacciones/interacciones.controller.js` (nuevo)
- `backend/src/modules/interacciones/interacciones.routes.js` (nuevo)
- `backend/src/routes/data.routes.js`
- `backend/src/routes/data/interacciones.routes.js` (nuevo)
- `backend/src/services/interactions/interactions.repository.js` (nuevo)
- `backend/src/services/interactions/interactions.service.js` (nuevo)
- `core/app.js`
- `core/interactions.js` (nuevo)

## Estabilidad
- No se modifica Push/Notificaciones.
- No se modifica `auth_audit`.
- No se agrega ni altera tabla alguna.
- Un fallo al guardar una interacción automática de backend se registra en log y no revierte la acción de negocio que ya fue exitosa.
- El Viewer continúa respetando su modo solo lectura; una mutación bloqueada no genera interacción de negocio.

## Deploy y prueba
1. Superponer este paquete sobre la versión vigente conservando carpetas.
2. Desplegar frontend/backend y reiniciar backend.
3. Hacer recarga forzada del navegador para asegurar la nueva versión de `core/app.js`.
4. Navegar por varias vistas, crear/editar/comentar/cambiar estatus en registros de prueba y volver a Home.
5. Confirmar Últimas 5 y después **Ver todo**.
6. Confirmar que al pulsar una interacción se abre el contexto registrado.

Consulta de verificación Aiven:

```sql
SELECT
  id_interaccion,
  id_usuario,
  tipo_interaccion,
  modulo,
  entidad,
  id_referencia,
  titulo,
  ruta_destino,
  created_at
FROM usuario_interacciones
ORDER BY id_interaccion DESC
LIMIT 30;
```

No puedo confirmar inserts/rutas contra Aiven desplegado hasta aplicar el paquete y ejecutar la prueba real.
