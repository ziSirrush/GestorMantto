# Gestor Mantto - Fase 3 Notificaciones

Fecha: 2026-08-25
Base revisada: `ziSirrush/GestorMantto` / `main` / `0dbbdf425bd17b5f3e6ad9a018d4ec1bc51eaaee`

## Objetivo

Migrar los flujos humanos de Ventas a sus seis `codigo_evento` oficiales, sin crear tablas ni eventos nuevos:

- `ventas.cotizacion.comentario`
- `ventas.cotizacion.estatus`
- `ventas.prospeccion.comentario`
- `ventas.prospeccion.estatus`
- `ventas.redes.comentario`
- `ventas.redes.estatus`

## Prerrequisitos

1. Aplicar primero **Fase 1 - Motor Central**.
2. Aplicar después **Fase 2 - Emisor seguro post-accion**.
3. Aplicar esta Fase 3.

La Fase 3 usa `notification-business-emitter.service.js`, entregado en Fase 2. No se duplica ese archivo en este ZIP porque no se modifica aquí.

## Archivos modificados

- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.controller.js`
- `backend/src/modules/ventas-prospeccion/ventas-prospeccion.controller.js`
- `backend/src/modules/ventas-redes/ventas-redes.controller.js`

## Archivo nuevo

- `backend/src/services/notifications/ventas-notification.service.js`

## Alcance funcional

### Cotizaciones

- Comentario nuevo: emite `ventas.cotizacion.comentario`.
- Cambio real de `estatus_proyecto`, tanto por edición general como por endpoint dedicado: emite `ventas.cotizacion.estatus`.
- Editar o eliminar un comentario existente no genera un evento de comentario creado.
- Si `estatus_proyecto` no cambia realmente, no se emite evento de estatus.

### Prospección

- Comentario/seguimiento nuevo: emite `ventas.prospeccion.comentario`.
- Cambio real de estatus: emite `ventas.prospeccion.estatus`.
- Los endpoints M2M `syncProspections` y `syncComments` no se convierten en emisores humanos; la Fase 3 actúa sobre la interacción humana confirmada.

### Redes

- Comentario nuevo: emite `ventas.redes.comentario`.
- Cambio real de `id_estatus`, ya sea por edición general o endpoint dedicado: emite `ventas.redes.estatus`.
- El propio servicio de negocio reporta `estatus_actualizado`; Fase 3 no emite cuando la acción no produjo cambio de estatus.

## Reglas preservadas

- La acción comercial se confirma primero; la notificación se intenta después.
- Un fallo de Notificaciones no revierte Cotizaciones, Prospección ni Redes.
- El actor se excluye.
- Todos los roles activos del usuario participan; el motor central vuelve a validar la matriz Evento-Rol.
- Obligatorio/opcional se lee de la configuración por Rol existente; Fase 3 no hardcodea esa política.
- No se usa `COMENTARIO` genérico en los tres controladores migrados.
- No se escribe directamente en `sup_notificaciones`.
- No hay fallback “enviar a todos”.

## Alcance de Información

Fase 3 reutiliza `backend/src/modules/ventas/ventas-visibility.service.js`, el mismo resolver usado por Ventas.

Después de obtener los usuarios candidatos por la matriz Evento-Rol, se conserva solo a quienes realmente pueden ver el registro:

- Cotizaciones: `id_asesor` o `id_admin`.
- Prospección: `id_usuario`.
- Redes: `id_usuario_asignado`.
- Usuarios con alcance total CORELLIAN conservan acceso conforme al resolver oficial.

La llamada al motor central declara `zonaOperativaNoAplica=true` únicamente porque Ventas/CORELLIAN no usa `z_op`; el alcance comercial ya se validó antes con el resolver oficial de Ventas.

## Deduplicación

Comentarios usan la PK persistente de la interacción:

- Cotización: `id_comentario`.
- Prospección: `id_com_pors`.
- Redes: `id_comentario`.

Los cambios de estatus usan:

- registro,
- estatus anterior,
- estatus nuevo,
- marca temporal persistida (`fecha_cambio_estatus`, `fecha_cam_estatus` o `updated_at`).

Esto permite distinguir cambios legítimos posteriores sobre el mismo registro.

## Navegación

Se conservan las rutas de detalle que ya utilizaba el emisor de comentarios de Ventas:

- Cotización: `ventas-cotizaciones-detalle`
- Prospección: `ventas-prospeccion-detalle`
- Redes: `ventas-asignacion-redes-detalle`

La notificación conserva `id_referencia` del registro real y `ABRIR_MODULO`.

## SQL

`backend/sql/20260825_VERIFICAR_NOTIFICACIONES_FASE_3_VENTAS.sql` es **solo lectura**. Verifica catálogo, matriz activa, usuarios candidatos, alcance CORELLIAN y prerrequisitos de deduplicación de Fase 1.

## Fuera de alcance

Esta fase no modifica:

- `FALLA_EQUIPO_CRITICO`
- `NUEVO_EQUIPO_CRITICO`
- `PERSONA_ATRAPADA`
- frontend de Ventas
- esquema de BD
- tablas de negocio
- catálogos de estatus

## Validación

Ver `validation/RESULTADO_VALIDACION_FASE_3.txt`.
