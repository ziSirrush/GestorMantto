# FIX Notificaciones configurables y sincronización híbrida V001

## Base acumulativa

Se usó como base conjunta:

1. `Ult ver 1308hrs - 0804.zip`.
2. `FIX_PANEL_LATERAL_PERMISOS_V001.zip`.
3. `FIX_DASHBOARD_VENTAS_INTERACCIONES_V001(1).zip`.

## Orden de aplicación

1. Ejecutar `database/migrations/20260804_notificaciones_configurables.sql` en Aiven.
2. Publicar backend.
3. Publicar frontend.

## 1. Servicio general de notificaciones configurable

Se agregó un servicio central en `backend/src/services/notifications` que:

- recibe un código de evento normalizado;
- elimina destinatarios duplicados;
- excluye al usuario que realizó la acción;
- aplica preferencias personales;
- respeta eventos obligatorios;
- inserta la notificación final en `sup_notificaciones`;
- mantiene las rutas y el formato ya usados por la campana.

Se añadieron:

- `notificacion_eventos`: catálogo de eventos notificables;
- `notificacion_preferencias`: configuración personal por usuario y evento;
- endpoints `GET` y `PUT /api/notificaciones/preferencias`;
- botón **Personalizar notificaciones** dentro de **Mi Perfil**.

Las notificaciones obligatorias no se pueden silenciar.

### Alcance de migración

Este FIX instala la infraestructura central y conserva los flujos actuales de Tickets, tareas y Soporte. Los módulos existentes que todavía insertan directamente en `sup_notificaciones` siguen funcionando. Para que una interacción nueva use preferencias antes de insertarse, su servicio debe migrarse gradualmente a `notificationService.emit(...)` entregando los destinatarios relacionados con la entidad.

No se inventaron destinatarios genéricos para Ventas porque cada acción requiere reglas validadas de creador, asesor, asignado, supervisor, cargos obligatorios y empresa.

## 2. Esquema híbrido de actualización

Se agregó `core/data-sync.js` con:

- revalidación selectiva al regresar con Back/Regresar;
- refresco inmediato después de `POST`, `PUT`, `PATCH` o `DELETE` exitosos;
- revalidación cuando la pestaña recupera visibilidad;
- revalidación al recuperar conexión;
- polling de respaldo cada 60 segundos solo para la ruta activa;
- prevención de llamadas duplicadas;
- sincronización entre pestañas mediante `BroadcastChannel`;
- registro extensible de funciones `refresh` por módulo.

El frontend muestra primero los datos conservados y luego revalida silenciosamente contra backend.

## Botón manual Actualizar

Los controles manuales cuyo texto o acción corresponda exactamente a Actualizar, Recargar, Refrescar o Sincronizar quedan visibles únicamente para:

- Programador;
- Programador United;
- Programador Corellian.

Director General, administradores o usuarios con acceso total no sustituyen el requisito del rol Programador.

## Archivos modificados

- `index.html`
- `core/auth.js`
- `core/data-sync.js`
- `modules/usuarios/usuarios.js`
- `modules/usuarios/usuarios.css`
- `backend/src/modules/notificaciones/notificaciones.routes.js`
- `backend/src/modules/notificaciones/notificaciones.controller.js`
- `backend/src/modules/notificaciones/notificaciones.service.js`
- `backend/src/services/notifications/notification.repository.js`
- `backend/src/services/notifications/notification.service.js`
- `database/migrations/20260804_notificaciones_configurables.sql`

## Validaciones realizadas

- `node --check` en todos los JavaScript modificados.
- `npm run check` del backend: estructura validada correctamente.
- Verificación de rutas frontend/backend de preferencias.
- Verificación de orden de carga de `core/data-sync.js`.
- No se realizó ejecución contra Aiven ni prueba multiusuario real desde este entorno.
