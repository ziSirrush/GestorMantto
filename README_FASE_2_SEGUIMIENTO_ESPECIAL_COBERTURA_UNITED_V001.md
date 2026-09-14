# FASE 2 - SEGUIMIENTO ESPECIAL · COBERTURA UNITED V001

Fecha: 2026-09-14  
Proyecto: Gestor Mantto  
Base GitHub revisada: `ziSirrush/GestorMantto` · `main` · commit `ed6d9d7e552b387cd0a6e0d2928786861b12c73c`  
Prerrequisito de programación: **FASE_1_SEGUIMIENTO_ESPECIAL_MOTOR_TRANSVERSAL_V001**.

## Objetivo

Cerrar la cobertura de Seguimiento Especial sobre los productores UNITED actuales asociados a Proyecto/Equipo y asegurar que una notificación creada por Seguimiento Especial no vuelva a desaparecer en Campana o Push por no tener un rol asociado al evento nativo.

La regla implementada es:

> Si el usuario tiene el Proyecto/Equipo en Seguimiento Especial y el resolver UNITED lo autoriza, recibe el mismo evento nativo con metadata `SEGUIMIENTO_ESPECIAL`; no se crea un evento paralelo y no se vuelve a exigir rol nativo.

## Regla funcional cerrada

- Se conserva el **evento nativo original**.
- Se conserva su ruta, referencia, prioridad e identidad de deduplicación.
- El follower recibe `SEGUIMIENTO_ESPECIAL`, que el catálogo `estados_visuales` resuelve como ⭐.
- Si una persona ya era destinatario normal y además follower: **una sola notificación**, con ⭐.
- La matriz de roles sigue aplicando sin cambios a los destinatarios normales.
- La exclusión nativa del actor se conserva.
- La precedencia existente de eventos críticos se conserva: no se inventa una segunda notificación genérica cuando el motor crítico ya eligió el evento ganador.
- El No. de Equipo se conserva internamente, pero la presentación visible mantiene `Proyecto - Ref en sitio`.

## Cobertura UNITED actual

### Portafolio

- `PORTAFOLIO_EQUIPO_INGRESO`
- `PORTAFOLIO_EQUIPO_SALIDA`
- `PORTAFOLIO_EQUIPO_CAMBIO`

`estatus_servicio` ya era un campo relevante del motor. Esta fase hace explícitas las transiciones:

- **En Servicio -> No en Servicio**: `PORTAFOLIO_EQUIPO_CAMBIO` + Seguimiento Especial.
- **No en Servicio -> En Servicio**: `PORTAFOLIO_EQUIPO_CAMBIO` + Seguimiento Especial.

No se crea un código de evento nuevo; se conserva el evento nativo de Portafolio.

### Tickets · sync / eventos nativos

- `TICKET_CREADO`
- `TICKET_ESTATUS_CAMBIADO`
- `TICKET_PRIORIDAD_CAMBIADA`
- `TICKET_ASIGNACION_CAMBIADA`
- `TICKET_RESPONSABILIDAD_CAMBIADA`

Cuando un Ticket hace la transición real hacia **Cerrado**:

```text
ANTES != Cerrado
DESPUES = Cerrado
```

se conserva `TICKET_ESTATUS_CAMBIADO`, pero la presentación queda como **Ticket cerrado** e incluye obligatoriamente:

```text
Estatus Final del Equipo: <valor>
```

Un update posterior de un Ticket que ya estaba Cerrado **no vuelve a anunciar "Ticket cerrado"**.

### Tickets · críticos

- `FALLA_EQUIPO_CRITICO`
- `PERSONA_ATRAPADA`
- `NUEVO_EQUIPO_CRITICO`
- `PERSONA_ATRAPADA_EQUIPO_CRITICO`
- `PERSONA_ATRAPADA_NUEVO_EQUIPO_CRITICO`

Todos pasan por el mismo `emitTicketEvent_uni()` con `contextoSeguimiento` UNITED.

### Tickets · acciones humanas

- `tickets.comentario.creado`
- `tickets.vobo.actualizado`

Comentario y Vo.Bo. conservan su evento nativo, deduplicación propia y `contextoSeguimiento` de Ticket/Proyecto/Equipo/Zona.

## Corrección de entrega Campana / Push

FASE 1 resolvió que el follower no dependa de la matriz de roles **al momento de crear la notificación**.

Esta Fase 2 cierra la segunda frontera: las consultas de Campana y Push también reconocen la metadata semántica `SEGUIMIENTO_ESPECIAL` y no vuelven a vetar la notificación por `SIN_ROL_ASOCIADO`.

No se hardcodea el emoji ⭐ en esta política. Solo se persiste el código semántico:

```text
SEGUIMIENTO_ESPECIAL
```

La presentación sigue viniendo del catálogo central `estados_visuales`.

Además, el código semántico se conserva aun cuando el lookup inmediato del catálogo falle temporalmente. Esto evita perder la identidad de Seguimiento Especial y permite que Campana/Push reconozcan la entrega; cuando el catálogo esté disponible, la UI/Push puede resolver la ⭐ desde el catálogo.

## Presentación visible

Esta fase es acumulativa con `FIX_NOTIFICACIONES_PROYECTO_REF_SITIO_V001` y conserva la norma:

```text
Evento
Proyecto - Ref en sitio
```

`numero_equipo` sigue disponible internamente para alcance, routing, criticidad, seguimiento y deduplicación.

## Archivos de programación

- `backend/src/services/notifications/notification.service.js`
- `backend/src/services/notifications/notification-policy.js`
- `backend/src/services/notifications/notification-site-label.service.js`
- `backend/src/services/notifications/ticket-critical-notifications_uni.service.js`
- `backend/src/services/notifications/portafolio-native-notifications_uni.service.js`
- `backend/src/services/notifications/portafolio-interest-notifications_uni.service.js`
- `backend/src/modules/tickets/tickets-notification-writes.service.js`
- `backend/package.json`

## Archivos de validación

- `validation/seguimiento-especial-notificaciones.test.js`
- `validation/seguimiento-especial-fase2-cobertura-united.test.js`
- `sql/VALIDAR_FASE_2_SEGUIMIENTO_ESPECIAL_COBERTURA_UNITED_V001.sql` — **solo lectura**.

El SQL incluido NO crea ni altera tablas y NO modifica datos. Sirve para verificar Aiven después del despliegue.

## No modifica

- Sync de negocio de Tickets.
- Estructura de tablas.
- Matriz Evento-Rol de destinatarios normales.
- Permisos UNITED.
- Alcance UNITED/ZOP.
- Reglas para marcar/desmarcar Seguimiento Especial.
- Reglas de criticidad 3/35.
- Rutas de detalle.
- Catálogo visual con un emoji hardcodeado.

## Validación ejecutada en el paquete integrado

### Sintaxis

`node --check`:

- 9 archivos JS/test revisados: **PASS**.
- `backend/package.json`: JSON válido.

### Prueba dirigida Fase 2

```text
node --test ../validation/seguimiento-especial-fase2-cobertura-united.test.js
9 tests
9 PASS
0 FAIL
```

Casos comprobados:

1. Ticket INSERT -> `TICKET_CREADO` y `Proyecto - Ref en sitio`.
2. Transición a Cerrado -> `TICKET_ESTATUS_CAMBIADO` presentado como Ticket cerrado + Estatus Final del Equipo.
3. Update posterior de Ticket ya cerrado no duplica el mensaje de cierre.
4. En Servicio -> No en Servicio.
5. No en Servicio -> En Servicio.
6. Comentario y Vo.Bo. conservan contexto Seguimiento.
7. Inventario de productores UNITED actuales con contexto Seguimiento.
8. Campana y Push reconocen `SEGUIMIENTO_ESPECIAL` sin rol nativo.
9. Metadata semántica se conserva aunque falle temporalmente el lookup del catálogo.

### Estructura

```text
npm run check
PASS
```

### Suite completa configurada

```text
npm test
54 tests
54 PASS
0 FAIL
```

## Aiven

**No se ejecutó ninguna consulta contra la Aiven real durante la construcción de este ZIP.**

Por lo tanto no puedo confirmar desde este entorno que la Aiven desplegada tenga actualmente los 15 eventos activos, la columna `codigos_visuales_json` y `SEGUIMIENTO_ESPECIAL = ⭐` activos.

Después del despliegue ejecutar únicamente, si se desea verificar la BD:

`sql/VALIDAR_FASE_2_SEGUIMIENTO_ESPECIAL_COBERTURA_UNITED_V001.sql`

Es de solo lectura.

## Orden

1. Aplicar **FASE 1**.
2. Sustituir con los archivos de **FASE 2** respetando las rutas del ZIP.
3. Reiniciar backend.
4. Ejecutar `npm run check` y `npm test`.
5. Ejecutar el SQL de validación de solo lectura en Aiven y revisar los resultados antes de dar Vo. Bo. funcional.
