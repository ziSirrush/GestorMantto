# FIX 4 - Permisos de Ventas auditados

Fecha: 2026-08-03
Estado: Desarrollo / Pruebas
Base revisada:

- `Revisar errores en actulizacion en Agrupacion Ventas.zip`
- `Dump20260803.sql`
- FIX 1, FIX 2 y FIX 3 entregados previamente

## Objetivo

Conectar los permisos reales de Cotizaciones a las rutas operativas y entregar un paquete acumulativo compatible con el proyecto y con la estructura SQL disponible.

## Hallazgos de auditoria

1. El middleware `ventas-cotizaciones-permissions.middleware.js` ya existia, pero ninguna ruta de Cotizaciones lo utilizaba.
2. El middleware original solo tomaba roles de `usuario_roles`; ahora tambien respeta el rol legado `usuarios.rol_id`, igual que el servicio de visibilidad.
3. El SQL original `20260728_VENTAS_COTIZACIONES_PERMISOS.sql` concedia los cuatro permisos a todos los roles activos.
4. Los IDs de acceso total validados son `1, 4, 34, 39`.
5. Los nombres de roles permanecen normalizados en minusculas porque `ventas-visibility.service.js` elimina acentos, recorta y ejecuta `toLowerCase()`.
6. El dump confirma las tablas `perm_subelemento_acciones`, `rol_permisos`, `usuario_permisos`, `usuario_roles` y `usuarios.rol_id` usadas por el middleware.
7. El historial corregido en el FIX 3 coincide con las columnas reales de `ventas_cotizaciones_historial`.
8. El SQL de dispositivo V003 conserva `usuarios_dispositivos.id_usuario BIGINT` y `id_dispositivo BIGINT UNSIGNED`, compatibles con el dump.
9. Se agrego la meta `mobile-web-app-capable` que faltaba en los entregables anteriores.

## Mapeo de permisos aplicado

- `VER`: catalogos, KPIs, embudo, vendidos, perdidos, proyeccion, listado, detalle, lectura de comentarios y archivos.
- `CREAR`: alta de cotizaciones.
- `EDITAR`: actualizacion general, estatus, asignacion, alta/edicion/baja de comentarios y archivos.
- `ELIMINAR`: baja logica de cotizaciones.

Los endpoints historicos de sincronizacion no se modificaron en este FIX para no alterar el flujo de importacion existente.

## SQL incluido

### `FIX_1_PUSH_DEVICE_PERMISSIONS_V003.sql`

Version acumulativa del ajuste de dispositivos. Crea o completa:

- `sistema_permisos_dispositivo`
- FK `usuarios_dispositivos -> usuarios`, solo si no hay huerfanos
- `notificaciones_push_suscripciones.id_dispositivo`
- indice y FK hacia `usuarios_dispositivos`

### `FIX_4_PERMISOS_VENTAS_V001.sql`

- Garantiza el catalogo de permisos de Cotizaciones.
- Concede `VER`, `CREAR`, `EDITAR` y `ELIMINAR` a los roles 1, 4, 34 y 39.
- No elimina permisos personalizados.
- No revoca automaticamente permisos de otros roles; al final genera una consulta diagnostica para revisarlos antes de administrar formalmente la agrupacion desde Panel de Control.

## Orden de aplicacion

1. Respaldar Aiven.
2. Ejecutar `database/FIX_1_PUSH_DEVICE_PERMISSIONS_V003.sql` si no se aplico la V002.
3. Ejecutar `database/FIX_4_PERMISOS_VENTAS_V001.sql`.
4. Revisar las dos consultas finales del SQL de permisos.
5. Publicar los archivos backend incluidos.
6. Publicar `core/auth.js`, `core/push-notifications.js` e `index.html`.
7. Reiniciar el backend.
8. Cerrar sesion, limpiar la version PWA anterior si conserva cache y volver a iniciar.
9. Probar con un usuario de los roles 1, 4, 34 o 39:
   - GET catalogos
   - GET detalle
   - POST cotizacion
   - PUT cotizacion
   - PATCH estatus
10. Probar con un usuario sin permiso y confirmar respuesta `403`, no `401`.

## Validaciones realizadas

- `node --check` en todos los JavaScript incluidos.
- Comparacion de nombres y tipos de columnas contra `Dump20260803.sql`.
- Verificacion de rutas y require paths contra el ZIP original.
- Confirmacion de cache-busters y meta PWA en `index.html`.

## Limitacion

El dump entregado contiene estructura, pero no permite distinguir el origen historico de cada fila de `rol_permisos`. Por estabilidad, este FIX no revoca automaticamente permisos existentes de otros roles.
