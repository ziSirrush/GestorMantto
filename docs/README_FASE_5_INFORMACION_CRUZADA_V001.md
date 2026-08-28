# FASE 5 - Información Cruzada V001

## Objetivo
Crear la tercera capa para detalles/vistas que mezclan información de distintos módulos.

## Archivo nuevo
- `backend/src/services/alcance/informacion-cruzada.service.js`
- `backend/scripts/test-informacion-cruzada.js`
- `ADR_INFORMACION_CRUZADA_V001.md`

## Regla
Para cada bloque hijo:

`permiso funcional -> alcance del bloque -> alcance del registro -> consulta`

El bloque padre no concede automáticamente acceso al bloque hijo.

## Ejemplo objetivo
Detalle Proyecto UNITED:

- Portafolio permitido + proyecto dentro del alcance -> puede abrir el detalle padre.
- Tickets sin permiso -> el loader de Tickets NO se ejecuta y `tickets` no se incorpora al payload.
- Tickets con permiso + alcance -> se consulta y se incorpora.

## Dependencias
Requiere las Fases 1 a 4 ya aplicadas:
- `alcance_gnral`
- `alcance_cor`
- `alcance_uni`
- resolver por `perm_agrupaciones.empresa`

Usa el servicio existente `effective-permission.service.js`; no crea una segunda lógica de permisos.

## Llaves maestras
La llave maestra resuelta por Fase 4 evita el filtro normal de alcance cuando corresponda, pero el permiso funcional del bloque sigue siendo obligatorio.

## Chats
Si el hilo pasa permiso + alcance, el loader devuelve el historial completo. Esta capa no elimina mensajes de participantes históricos.

## Alcance de esta fase
Esta fase crea el motor reusable. No modifica todavía Detalle Proyecto, Detalle Equipo, frontend, rutas, Panel de Control ni módulos en Nevera. La migración/integración por módulo corresponde a la siguiente fase.

## Base revisada
Repositorio `ziSirrush/GestorMantto`, rama `main`, HEAD verificado durante la generación: `f03066618a6c329eab8669f2d61a0d5b546e9c4e`.

## Validaciones
- Sintaxis Node de los archivos nuevos.
- Prueba de permiso denegado sin ejecutar loader.
- Prueba de alcance denegado sin ejecutar loader.
- Prueba de permiso + alcance permitido.
- Prueba de llave maestra sin saltar permiso funcional.
- Prueba de `contextUser`.
- Prueba de historial completo de chat.
- Prueba fail-closed sin `recordScopeCheck`.
