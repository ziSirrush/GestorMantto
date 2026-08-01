# FIX Permisos Push Safari y revalidación desde Perfil V006

## Correcciones

- Restaura `ManttoDevicePermissions.revalidateFromProfile()`.
- El botón de Mi Perfil vuelve a abrir el asistente individual de permisos.
- Evita alertas técnicas al usuario si la función no está disponible.
- En iPhone/iPad abierto como pestaña de Safari, Push se muestra como disponible únicamente desde la PWA instalada.
- Separa el permiso nativo de notificaciones del registro de la suscripción Push.
- La falta de sincronización con `/api/device-permissions/sync` ya no invalida permisos concedidos ni bloquea Continuar.
- Permite reintentar la sincronización sin volver a solicitar el permiso del sistema.
- Elimina el indicador Push legado del encabezado; el estado permanece en Mi Perfil.
- Actualiza versiones de recursos para invalidar caché.

## Archivos modificados

- `index.html`
- `core/device-permissions.js`
- `core/push-notifications.js`
- `modules/usuarios/usuarios.js`
- `styles/device-permissions.css`

## Aplicación

Aplicar después de V005. Cerrar por completo la PWA o pestaña y volver a abrirla para cargar los recursos V006.
