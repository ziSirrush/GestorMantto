# FIX URGENTE Fase 6 - Separacion de empresas V002

## Estado de Fase 6 V001

La Fase 6 V001 queda invalidada para el guardado de Roles y Permisos.

## Causa corregida

1. El frontend enviaba la matriz completa del catalogo al guardar un rol, incluyendo permisos de General, United y Corellian disponibles para el administrador.
2. La backend aceptaba `replace_all` y escribia todos esos registros en `rol_permisos` para el rol seleccionado.
3. La resolucion de roles sumaba simultaneamente `usuario_roles` y `usuarios.rol_id`, por lo que un valor historico o desincronizado podia agregar un rol adicional al usuario.

## Correccion

- Guardar Roles y Permisos envia solo los cambios que el usuario modifico expresamente.
- Se elimina el modo `replace_all` del flujo de guardado.
- La backend confirma unicamente los cambios recibidos.
- `usuario_roles` es la fuente principal de roles activos.
- `usuarios.rol_id` se utiliza solo como respaldo cuando el usuario no tiene ninguna relacion activa en `usuario_roles`.

## Archivos modificados

- `modules/panel-control/panel-control.js`
- `backend/src/controllers/panel-control.controller.js`
- `backend/src/middleware/ventas-cotizaciones-permissions.middleware.js`

## Importante

Este FIX evita nuevas mezclas, pero no revierte automaticamente registros que ya hayan sido modificados en `rol_permisos` al usar la V001. Para reparar datos ya afectados se necesita una exportacion actualizada de las tablas de permisos y conocer que roles fueron guardados despues del despliegue de V001.

No modifica `usuarios.empresa` ni contiene SQL de escritura.
