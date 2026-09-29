# FASE 2/4 — Seguimiento Especial · Ticket · Integracion con Notificaciones V001

## Base revisada

- Repositorio: `ziSirrush/GestorMantto`
- Rama: `main`
- Commit base verificado: `f69aa5d40796c5976cf8d59eb6f6f99dbd930299`
- Version base: `Version 092826.3`
- Dependencia: `FASE_1_SEGUIMIENTO_ESPECIAL_TICKET_BACKEND_V001`
- Tabla `seguimiento_especial`: asumida como existente, segun instruccion del proyecto.

## Objetivo de esta fase

Conectar la suscripcion puntual `TICKET` de la tabla general `seguimiento_especial` con el motor transversal de Notificaciones ya existente.

Esta fase NO crea otro motor y NO sustituye la logica de `portafolio_interes`.

## Cambio funcional

Cuando un evento UNITED llega con:

```text
dominio = UNITED
tipo = TICKET
id_ticket = <tickets.id>
```

el resolver consulta la suscripcion puntual:

```text
seguimiento_especial
  origen = UNITED
  entidad_tipo = TICKET
  entidad_id = tickets.id
  activo = 1
```

Ese follower se fusiona con los followers que ya puedan corresponder por Proyecto/Equipo.

### Regla de independencia

Seguir un Ticket:

- NO sigue el Proyecto;
- NO sigue el Equipo;
- NO sigue otros Tickets del mismo Proyecto;
- NO sigue otros Tickets del mismo Equipo.

### Deduplicacion

Si un usuario sigue simultaneamente:

```text
Ticket 254013
Equipo del Ticket
Proyecto del Ticket
```

recibe una sola entrega. Para trazabilidad el origen directo `TICKET` prevalece sobre los origenes de Portafolio.

## Eventos cubiertos por la infraestructura actual

No se inventan eventos nuevos. La suscripcion directa utiliza los productores ya existentes que entregan contexto de Ticket, incluidos:

- `TICKET_CREADO`
- `TICKET_ESTATUS_CAMBIADO`
- `TICKET_PRIORIDAD_CAMBIADA`
- `TICKET_ASIGNACION_CAMBIADA`
- `TICKET_RESPONSABILIDAD_CAMBIADA`
- `tickets.comentario.creado`
- `tickets.vobo.actualizado`
- eventos criticos de Ticket con `contextoSeguimiento`

### Cierre y reapertura

El baseline actual clasifica como `TICKET_ESTATUS_CAMBIADO` cualquier cambio en:

- `estado_ticket`
- `estado`
- `estatus_equipo_final`
- `fecha_cierre`

Por lo tanto el Ticket seguido participa en cierre, reapertura/cambio de estado y cambios del Estatus Final del Equipo sin crear un evento paralelo.

## Seguridad conservada

El follower directo de Ticket todavia debe cumplir al momento de la notificacion:

1. usuario activo;
2. permiso efectivo de Seguimiento Especial;
3. alcance UNITED/ZOP vigente.

La fila activa de `seguimiento_especial` por si sola no concede acceso.

Tambien se conserva la exclusion nativa del actor definida por el emisor del evento.

## Archivos modificados

- `backend/src/services/notifications/portafolio-seguimiento-especial-notifications_uni.service.js`
- `backend/package.json`

## Archivos nuevos

- `validation/seguimiento-especial-ticket-fase2-notificaciones.test.js`
- `docs/ADR_20260929_SEGUIMIENTO_ESPECIAL_TICKET_NOTIFICACIONES_V001.md`
- `docs/README_FASE_2_SEGUIMIENTO_ESPECIAL_TICKET_NOTIFICACIONES_V001.md`
- `docs/MANIFEST_FASE_2_SEGUIMIENTO_ESPECIAL_TICKET_NOTIFICACIONES_V001.txt`
- `docs/CHECKSUMS_FASE_2_SEGUIMIENTO_ESPECIAL_TICKET_NOTIFICACIONES_V001_SHA256.txt`

## Qué NO cambia

- `portafolio_interes`: sin cambios.
- API de Proyecto/Equipo: sin cambios.
- `seguimiento_especial` schema: sin cambios.
- SQL/Aiven: ninguno.
- `notification.service.js`: sin cambios; ya fusiona, deduplica y decora followers resueltos.
- productores de Ticket: sin cambios; ya entregan `contextoSeguimiento`.
- frontend: sin cambios.
- permisos: no se crean ni renombran en esta fase.

## Validaciones del entregable

### Sintaxis

```text
node --check backend/src/services/notifications/portafolio-seguimiento-especial-notifications_uni.service.js
node --check validation/seguimiento-especial-ticket-fase2-notificaciones.test.js
```

Resultado: PASS.

### Prueba dirigida

```text
node --test validation/seguimiento-especial-ticket-fase2-notificaciones.test.js
```

Resultado al generar el paquete: **13/13 PASS**.

Casos cubiertos:

1. follower directo de Ticket funciona sin depender de `portafolio_interes`;
2. suscripcion exacta por `tickets.id`, sin herencia a otro Ticket;
3. Ticket directo se suma a Proyecto/Equipo;
4. deduplicacion Ticket + Proyecto;
5. snapshot previo no suprime Ticket directo;
6. Ticket prevalece sobre Equipo como origen cuando es el mismo usuario;
7. permiso revocado elimina al follower;
8. `id_ticket` puede completarse desde la referencia del Ticket;
9. entidades no-Ticket no consultan la capa general como Ticket;
10. estatus/cierre-reapertura, comentario, Vo.Bo. y criticos participan;
11. consulta exige activo y revalida alcance UNITED/ZOP;
12. otro dominio falla cerrado;
13. `portafolio_interes` sigue siendo solo lectura en este resolver.

## Validaciones no ejecutadas

- E2E real contra Aiven: no ejecutado.
- Push real: no ejecutado.
- Campana real en Azure: no ejecutado.
- Suite completa del repositorio: no ejecutada en este paquete aislado.
- Deploy: no realizado.

## Instalacion

### Prerrequisito

Aplicar primero Fase 1.

Copiar el contenido de este ZIP sobre la raiz del repositorio, conservando rutas.

Despues, desde `backend`:

```powershell
npm run check
npm test
```

No ejecutar SQL para Fase 2.

## Siguiente fase

**Fase 3/4 — Frontend · Detalle Ticket:** agregar el control de Seguimiento Especial al detalle del Ticket usando la API creada en Fase 1.
