# FASE 1/4 - Seguimiento Especial · TICKET · Backend V001

## Base revisada

- Repositorio: `ziSirrush/GestorMantto`
- Rama: `main`
- Commit base verificado: `f69aa5d40796c5976cf8d59eb6f6f99dbd930299` - `Version 092826.3`
- `backend/src/routes/index.js` base blob: `935023e8b626b3068fe15e9b8de66ec0c2a5775a`
- `backend/package.json` base blob: `25716375e32cdd904d745f4d173643d461909931`

## Objetivo

Implementar la persistencia y API backend del tercer nivel funcional de Seguimiento Especial: **TICKET**, usando la tabla general `seguimiento_especial` ya creada.

Esta fase NO conecta todavia el Ticket seguido al motor de notificaciones y NO agrega frontend.

## Regla funcional

Un usuario puede activar Seguimiento Especial sobre un Ticket concreto.

Ejemplo:

```text
Usuario
  -> UNITED
     -> TICKET 254013
```

La suscripcion persiste:

- `origen = UNITED`
- `entidad_tipo = TICKET`
- `entidad_id = tickets.id`
- `entidad_clave = tickets.ticket`

No se hereda hacia Proyecto o Equipo y no incluye otros Tickets del mismo Equipo/Proyecto.

El cierre del Ticket no elimina la suscripcion. La suscripcion solo se desactiva de forma explicita.

## Endpoints agregados

### Listado personal

`GET /api/seguimiento-especial/tickets`

Devuelve exclusivamente Tickets activos en Seguimiento Especial del usuario autenticado y dentro de su alcance UNITED actual.

### Estado de un Ticket

`GET /api/tickets/:ticket/seguimiento-especial`

Resuelve el Ticket dentro del alcance del usuario y devuelve el estado personal de seguimiento.

### Activar / desactivar

`PUT /api/tickets/:ticket/seguimiento-especial`

Body:

```json
{
  "activo": true
}
```

La operacion es idempotente:

- activar algo ya activo no reescribe la fila;
- desactivar algo ya inactivo no reescribe la fila;
- desactivar un Ticket nunca seguido no crea una fila inactiva.

## Seguridad y alcance

Se reutilizan los permisos vigentes:

- `PORTAFOLIO_SEGUIMIENTO_ESPECIAL_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`
- `PORTAFOLIO_SEGUIMIENTO_ESPECIAL_SEGUIMIENTO_PROYECTO_EQUIPO.GESTIONAR_SEGUIMIENTO`

No se crea un permiso nuevo en Fase 1.

El Guard General conserva dominio UNITED y la puerta de informacion vigente de Seguimiento Especial. GET/PUT por Ticket pasan por `requireTicketRecordScope_gnral` y el servicio vuelve a limitar la entidad con `buildTicketScopeSql_gnral` antes de consultar o mutar la suscripcion.

El seguimiento es personal: el modo Visor de otro usuario no puede leer ni modificar su estado.

## Archivos modificados

- `backend/src/routes/index.js`
- `backend/package.json`

## Archivos nuevos

- `backend/src/modules/seguimiento-especial/seguimiento-especial.repository.js`
- `backend/src/modules/seguimiento-especial/seguimiento-especial.service.js`
- `backend/src/modules/seguimiento-especial/seguimiento-especial.controller.js`
- `backend/src/modules/seguimiento-especial/seguimiento-especial.routes.js`
- `validation/seguimiento-especial-ticket-fase1-api.test.js`
- `docs/ADR_20260929_SEGUIMIENTO_ESPECIAL_GENERAL_TICKET_V001.md`
- `docs/README_FASE_1_SEGUIMIENTO_ESPECIAL_TICKET_BACKEND_V001.md`
- `docs/MANIFEST_FASE_1_SEGUIMIENTO_ESPECIAL_TICKET_BACKEND_V001.txt`
- `docs/CHECKSUMS_FASE_1_SEGUIMIENTO_ESPECIAL_TICKET_BACKEND_V001_SHA256.txt`

## Base de datos

No incluye SQL.

Prerrequisito declarado para esta entrega: `seguimiento_especial` ya existe y respeta el contrato documentado en el ADR.

No se modifica `portafolio_interes`.

## Que NO cambia en Fase 1

- Proyecto/Equipo de Portafolio: sin cambios.
- `portafolio_interes`: sin cambios.
- Motor de notificaciones: sin cambios; corresponde a Fase 2.
- Productores de eventos de Ticket: sin cambios.
- Frontend de Detalle Ticket: sin cambios; corresponde a Fase 3.
- Vista/listado de Tickets en Seguimiento Especial: frontend sin cambios; corresponde a Fase 4.
- Aiven: no fue escrito por esta entrega.
- GitHub: no fue escrito por esta entrega.
- Azure: no fue desplegado.
- Netlify: no fue desplegado.

## Validaciones ejecutadas

### Validacion estatica

PASS:

- `node --check backend/src/modules/seguimiento-especial/seguimiento-especial.repository.js`
- `node --check backend/src/modules/seguimiento-especial/seguimiento-especial.service.js`
- `node --check backend/src/modules/seguimiento-especial/seguimiento-especial.controller.js`
- `node --check backend/src/modules/seguimiento-especial/seguimiento-especial.routes.js`
- `node --check backend/src/routes/index.js`
- `node --check validation/seguimiento-especial-ticket-fase1-api.test.js`
- parse JSON de `backend/package.json`

### Prueba local dirigida

Comando:

```powershell
node --test validation/seguimiento-especial-ticket-fase1-api.test.js
```

Resultado: **11/11 PASS**.

Casos cubiertos:

1. GET de Ticket no seguido devuelve `activo=false` sin crear relación.
2. PUT activo canoniza `UNITED + TICKET + tickets.id + tickets.ticket`.
3. PUT inactivo conserva una relación existente con `activo=0`.
4. Desactivar un Ticket nunca seguido es idempotente y no crea fila.
5. Repetir el mismo estado no reescribe la suscripción ni `updated_at`.
6. El listado personal entrega entidades TICKET activas.
7. Modo Visor falla cerrado para el estado personal.
8. El repository genérico persiste en `seguimiento_especial` y no toca `portafolio_interes`.
9. El listado aplica alcance UNITED sobre la entidad fuente `tickets`.
10. Tabla `seguimiento_especial` ausente se traduce a error 503 controlado.
11. Contrato de rutas GET/PUT, Guard vigente y montaje global del router.

### No ejecutado

- Suite completa del repositorio: no ejecutada; el entorno de entrega no dispone de checkout completo de `main`.
- Prueba contra Aiven: no ejecutada.
- Prueba E2E autenticada: no ejecutada.
- Deploy backend: no ejecutado.

## Instalacion

1. Confirmar que el repositorio local parte del commit esperado o revisar el diff si `main` avanzo.
2. Extraer el ZIP sobre la raiz del repositorio conservando la estructura de carpetas.
3. Desde `backend`, ejecutar:

```powershell
npm run check
npm test
```

4. No ejecutar SQL para esta fase.

## Siguiente fase

**Fase 2/4 - Backend Notificaciones:** el resolver de Seguimiento Especial debera combinar la suscripcion directa `TICKET` de `seguimiento_especial` con los seguidores actuales de `portafolio_interes`, deduplicando destinatarios y sin convertir un Ticket seguido en seguimiento de Proyecto/Equipo.
