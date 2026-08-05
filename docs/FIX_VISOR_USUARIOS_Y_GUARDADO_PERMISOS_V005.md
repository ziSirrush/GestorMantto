# FIX VISOR DE USUARIOS Y GUARDADO DE PERMISOS V005

## Base reconstruida

Se reconstruyó el estado vigente conocido aplicando, en orden:

1. Última versión completa `Ult ver 1308hrs - 0804(2).zip`.
2. Fases 1, 2 y 3 del Visor de usuarios.
3. Fase 6 V001.
4. Rescate estable de API `FIX_EMERGENCIA_API_PANEL_CONTROL_COMPATIBLE_V004`.
5. Este FIX V005.

## Problema 1: el botón Visor de usuarios desapareció

`FASE_6_PERMISOS_VENTAS_INTEGRACION_V001` reemplazó `core/user-viewer.js` por una versión que:

- autorizaba el visor mediante nombres de rol Programador;
- dejó de controlar el botón superior mediante el permiso efectivo de General;
- eliminó la apertura en pestaña nueva de la Fase 1;
- eliminó la integración de solo lectura de la Fase 3.

Después, el rescate V004 restauró el controlador y la ruta de Panel de Control desde una base anterior, retirando además los endpoints del visor.

## Corrección del visor

- Se restaura la autorización mediante:
  `GENERAL_VISOR_USUARIOS_OPERACION.USAR_VISOR`.
- Se restaura el botón superior.
- Se restaura la pestaña `Visor de usuarios` dentro del Panel de Control.
- Se restaura la apertura en una pestaña nueva.
- Se conserva el contexto temporal firmado y el modo de solo lectura.
- Se conservan `ManttoPermissions` y los permisos granulares de acciones incorporados por la Fase 6.
- Se restauran los endpoints:
  - `GET /api/panel-control/viewer-users`
  - `POST /api/panel-control/viewer-context`
- Se conserva la pareja compatible de ruta/controlador que mantiene viva la API.

## Problema 2: Aiven confirmó 0 de N permisos

La interfaz de la Fase 6 esperaba que la respuesta del backend incluyera:

- `updated`
- `confirmed`
- `mismatches`

El controlador estable restaurado por V004 devuelve correctamente `updated`, pero no devuelve `confirmed`. La interfaz interpretaba ese campo ausente como cero, aunque Aiven sí hubiera procesado los cambios.

## Corrección del guardado

El flujo queda:

1. Envía únicamente las casillas modificadas.
2. Comprueba que `updated` coincida con la cantidad enviada.
3. Vuelve a consultar los permisos del usuario o rol.
4. Compara cada valor realmente guardado:
   - Usuario: heredar, permitir o denegar.
   - Rol: permitido o no permitido.
5. Solo limpia los cambios y recarga la aplicación cuando todos coinciden.
6. Si alguno no coincide, conserva los cambios pendientes y muestra la cantidad confirmada.

Ya no depende del campo `confirmed` en la respuesta del PUT y no usa `replace_all`.

## Archivos modificados

- `core/user-viewer.js`
- `modules/panel-control/panel-control.js`
- `backend/src/controllers/panel-control.controller.js`
- `backend/src/routes/panel-control.routes.js`

## No modifica

- Aiven/MySQL.
- Roles o usuarios.
- `rol_permisos` o `usuario_permisos` mediante SQL.
- La clasificación GENERAL, UNITED o CORELLIAN.
- Módulos de Ventas.

## Despliegue

Se deben publicar frontend y backend.

No requiere ejecutar SQL.

## Validaciones realizadas

- `node --check` correcto en los cuatro JavaScript.
- `npm run check` correcto sobre una reconstrucción acumulativa del proyecto.
- Se verificó que todos los handlers usados por `panel-control.routes.js` sean funciones.
- Se verificó que el controlador estable V004 y el controlador de este FIX difieran únicamente por la restauración controlada del Visor de usuarios.
- No se realizaron operaciones reales contra Aiven ni una sesión de navegador autenticada desde este entorno.
