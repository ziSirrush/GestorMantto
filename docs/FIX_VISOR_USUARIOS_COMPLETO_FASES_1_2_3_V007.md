# FIX Visor de usuarios completo · Fases 1, 2 y 3 · V007

## Base de compatibilidad

Este FIX reconstruye las tres fases originales del Visor de usuarios sobre la pareja estable de Panel de Control que recuperó la API.

También preserva el FIX V006 de guardado selectivo porque **no reemplaza**:

- `modules/panel-control/panel-control.js`
- `modules/panel-control/panel-control.css`

## Funcionalidad restaurada

### Fase 1 · Pestaña independiente

- Permiso `GENERAL_VISOR_USUARIOS_OPERACION.USAR_VISOR`.
- Botón superior y pestaña dentro de Panel de Control.
- Listado de usuarios protegido por permiso efectivo.
- Contexto temporal firmado con vigencia de 30 minutos.
- Apertura en pestaña nueva sin sustituir la sesión real.
- Almacenamiento del usuario visualizado en `sessionStorage`.

### Fase 2 · Identidad efectiva

- `req.actorUser` conserva al usuario real.
- `req.contextUser` conserva al usuario visualizado.
- Las lecturas usan como `req.user` al usuario visualizado.
- `GET /api/panel-control/viewer-bootstrap` hidrata identidad, roles y zonas actuales.
- La sesión real permanece intacta en `/api/auth/me` y permisos del dispositivo.
- Indicadores técnicos y controles de Programador se calculan con el usuario visualizado.

### Fase 3 · Solo lectura

- Bloqueo global backend de `POST`, `PUT`, `PATCH` y `DELETE` en modo visor.
- Excepción controlada para `POST /api/panel-control/viewer-close`.
- Protección frontend de formularios, comentarios, archivos y demás mutaciones.
- Franja `MODO VISOR · SOLO LECTURA`.
- Auditoría de inicio, cierre e intentos bloqueados mediante `auth_audit`.

## Rutas restauradas como pareja compatible

- `GET /api/panel-control/viewer-users`
- `GET /api/panel-control/viewer-bootstrap`
- `POST /api/panel-control/viewer-context`
- `POST /api/panel-control/viewer-close`

Los cuatro handlers existen y están exportados por `panel-control.controller.js`.

## Archivos incluidos

- `index.html`
- `styles/base.css`
- `core/auth.js`
- `core/data-sync.js`
- `core/user-viewer.js`
- `core/viewer-readonly.js`
- `backend/src/app.js`
- `backend/src/controllers/panel-control.controller.js`
- `backend/src/routes/panel-control.routes.js`
- `backend/src/middleware/auth.middleware.js`
- `backend/src/middleware/viewer-readonly.middleware.js`
- `backend/src/services/user-viewer.service.js`
- `backend/src/services/permissions/effective-permission.service.js`
- `database/FASE_1_VISOR_USUARIOS_PERMISO_GENERAL_V001.sql`

## Base de datos

El SQL se incluye para que el paquete sea completo, pero es idempotente.

Si el permiso `GENERAL_VISOR_USUARIOS_OPERACION.USAR_VISOR` ya aparece en Panel de Control, **no es necesario volver a ejecutarlo**.

## Orden de despliegue

1. Reemplazar los archivos del backend y desplegar backend.
2. Confirmar que la API inicia y `/api/health` responde.
3. Reemplazar los archivos del frontend y desplegar frontend.
4. Realizar recarga forzada del navegador.
5. Abrir el visor, validar una consulta y confirmar que una mutación sea bloqueada.

## Validaciones realizadas

- `node --check` correcto en los 11 JavaScript modificados o agregados.
- `npm run check` correcto en el backend completo simulado.
- `panel-control.routes.js` cargado con Express sin handlers indefinidos.
- Correspondencia validada entre rutas y exportaciones del controlador.
- `createApp()` cargado correctamente con el middleware de solo lectura.
- `index.html` conserva las versiones actuales de los módulos no relacionados.
- No se modificaron Panel de Control V006, usuarios, empresas, roles ni asignaciones almacenadas en Aiven.

No se pudo ejecutar una sesión real contra Aiven desde este entorno.
