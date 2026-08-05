# Fase 1 · Visor de usuarios en pestaña nueva V001

## Base utilizada

- `ult ver 2235hrs - 0804.zip`

## Hallazgo

El visor existente dependía de nombres de rol Programador y guardaba al usuario visualizado en `localStorage`. Esto mezclaba el contexto entre la pestaña administrativa y la pestaña de visualización.

## Cambios

- Se agregó el permiso general `GENERAL_VISOR_USUARIOS_OPERACION.USAR_VISOR`.
- El botón **Visor de usuario** del encabezado se muestra únicamente cuando el permiso efectivo está activo.
- El listado de usuarios se obtiene desde un endpoint protegido por el mismo permiso.
- Al seleccionar un usuario se crea un contexto temporal firmado, con vigencia de 30 minutos.
- La vista se abre en una pestaña nueva y conserva la pestaña original sin cambiar de ruta.
- El usuario visualizado y el token temporal se guardan en `sessionStorage`, evitando contaminar otras pestañas.
- Se conserva el alcance por empresa de Programador United y Programador Corellian.
- El permiso se asigna inicialmente a los tres roles Programador para conservar el acceso previo. Otros roles o usuarios pueden recibirlo desde Panel de Control.

## Alcance de esta fase

Esta fase implementa el permiso, el botón, la selección de usuario y la apertura independiente. La fidelidad completa de filtros, consultas y datos del usuario visualizado corresponde a la Fase 2. El bloqueo visual y backend de crear, editar, eliminar o guardar corresponde a la Fase 3.

## Archivos modificados

- `index.html`
- `styles/base.css`
- `core/auth.js`
- `core/user-viewer.js`
- `backend/src/middleware/auth.middleware.js`
- `backend/src/controllers/panel-control.controller.js`
- `backend/src/routes/panel-control.routes.js`

## Archivos nuevos

- `backend/src/services/permissions/effective-permission.service.js`
- `backend/src/services/user-viewer.service.js`
- `database/FASE_1_VISOR_USUARIOS_PERMISO_GENERAL_V001.sql`
- `docs/FASE_1_VISOR_USUARIOS_NUEVA_PESTANA_V001.md`

## Orden de aplicación

1. Ejecutar `database/FASE_1_VISOR_USUARIOS_PERMISO_GENERAL_V001.sql` en Aiven/MySQL Workbench.
2. Publicar los archivos del backend.
3. Publicar los archivos del frontend.
4. Asignar o retirar el permiso desde Panel de Control según corresponda.

## Validaciones realizadas

- Sintaxis JavaScript revisada con `node --check`.
- Estructura backend revisada con `npm run check`.
- Consistencia entre rutas y controladores comprobada.
- Montaje de `/api/panel-control` y existencia de `/api/health` confirmados sin modificación.
- SQL comparado con los patrones reales de permisos existentes en el proyecto.

No se ejecutaron pruebas contra Aiven ni una sesión multiusuario real desde este entorno.
