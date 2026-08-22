# FIX 2 — Panel de Control sin regresión V001

**Fecha:** 17/08/2026

## Objetivo
Integrar la administración de Notificaciones ya incluida en el lote pendiente, conservando los fixes vigentes de reseteo de credenciales del Panel de Control.

## Base
- Archivo funcional base: `modules/panel-control/panel-control.js` del predeploy compartido por el usuario.
- Referencia de compatibilidad: versión vigente de `main` para el flujo de reseteo de credenciales.
- No se sustituye la nueva matriz de Notificaciones.

## Archivo modificado
- `modules/panel-control/panel-control.js`

## Restaurado / conservado
- Contraseña temporal conservada en `sessionStorage` únicamente durante la sesión administrativa correspondiente.
- Verificación de `user_id` devuelto por backend antes de mostrar credenciales.
- Validación `credential_verified === true` antes de considerar exitoso el reseteo.
- Botón `Copiar` para la contraseña temporal activa.
- La contraseña temporal permanece visible mientras `must_change_password = 1`.
- Polling de 30 segundos únicamente mientras el usuario seleccionado continúa pendiente de primer acceso.
- Limpieza automática de la contraseña temporal cuando el usuario completa el primer acceso.
- Se detiene el polling al cambiar/cancelar la selección de usuario.
- Se conserva íntegramente la pestaña/matriz nueva de Notificaciones, selección masiva y políticas Obligatoria/Opcional.

## No modificado
- Backend.
- SQL / Aiven.
- `panel-control.css`.
- `index.html` (cache-bust se deja para el FIX 4 de integración final, según el plan acordado).
- Módulos ajenos al Panel de Control.

## Validaciones
- `node --check modules/panel-control/panel-control.js` — PASS.
- Pestaña Notificaciones presente — PASS.
- Endpoint de matriz de Notificaciones conservado — PASS.
- Selección masiva de roles conservada — PASS.
- Política masiva Obligatoria/Opcional conservada — PASS.
- Persistencia temporal de credencial — PASS.
- Verificación de `credential_verified` — PASS.
- Verificación de `user_id` — PASS.
- Copiar contraseña temporal — PASS.
- Polling de estado cada 30 s — PASS.
- Limpieza al concluir primer acceso — PASS.

## Aplicación
Copiar el contenido del ZIP sobre el predeploy/lote pendiente, respetando la estructura de carpetas.
