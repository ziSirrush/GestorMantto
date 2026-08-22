# FASE 3 - UNITED · TICKETS POR CUARTOS V001

Fecha: 2026-08-20

## Base verificada

- Repositorio: `JIVMBLT/updated_code`
- Rama: `main`
- Commit base: `f4e7b56b25d4c34e67ccd17aaceacbe8f0e5687b`
- Mensaje: `fix FASES DE ALCANCE 1 - 6 . 1`
- Prerrequisitos acumulativos:
  - `FASE_1_UNI_PUERTAS_CUARTOS_V001`
  - `FASE_2_UNI_PORTAFOLIO_CUARTOS_V001`

## Estructura verificada

En `Estruturacompleta081626.sql`:

- `tickets.zona` es `varchar(120)` y no tiene FK directa a `z_op`;
- `tickets.codigo_equipo`, `tickets.proyecto` y `tickets.proyecto_padre` existen;
- `portafolio.numero_equipo` es unico;
- `portafolio.zona_id` tiene FK a `z_op.id_zona`;
- `usuario_zop.zona_id` tiene FK a `z_op.id_zona`.

Por esa razon esta fase NO usa `tickets.zona` como autoridad de seguridad.

## Problema confirmado

El Guard General ya estaba conectado a las rutas de Tickets, pero:

- `GET /tickets` seguia delegando al handler legacy;
- el handler legacy ejecutaba `SELECT * FROM tickets ORDER BY id DESC LIMIT 50000` sin consumir `req.informationAccess`;
- el builder de Ticket de Fase 1 resolvia por `codigo_equipo OR proyecto OR proyecto_padre` dentro del mismo `EXISTS`.

Ese ultimo punto podia producir una autorizacion demasiado amplia: un Ticket con `codigo_equipo` fuera de los cuartos del usuario podia llegar a coincidir por nombre de proyecto con Portafolio de un cuarto autorizado.

## Regla territorial definitiva para Tickets

La Fase 3 adopta una precedencia fail-closed.

### Caso A - Ticket con `codigo_equipo`

Si `codigo_equipo` tiene valor:

1. se busca exclusivamente `portafolio.numero_equipo`;
2. la fila debe tener `estado_registro = 1`;
3. `portafolio.zona_id` debe estar dentro de `req.informationAccess.alcance.zona_ids`;
4. NO existe fallback por proyecto.

Por lo tanto, el codigo de equipo manda sobre cualquier coincidencia textual de proyecto.

### Caso B - Ticket sin `codigo_equipo`

Solo entonces se permiten `proyecto` y `proyecto_padre` como referencias alternativas.

Para autorizar el Ticket, el conjunto completo de filas Portafolio que coincidan con cualquiera de esas referencias debe cumplir simultaneamente:

- existir al menos una fila;
- no contener `zona_id` nula;
- resolver a exactamente una `zona_id` distinta;
- esa unica zona debe pertenecer a los cuartos del usuario.

Si `proyecto` y `proyecto_padre` apuntan a zonas diferentes, el Ticket falla cerrado.

### `tickets.zona`

Permanece como dato operativo/informativo. No se usa para conceder acceso hasta que exista una homologacion verificable y, de ser necesario, una relacion estructurada con `z_op`.

## Cambios

### 1. Motor UNITED

Archivo:

`backend/src/services/alcance/alcance-uni.service.js`

Se endurece `buildResolvedTicketScopeSql_uni()` con la precedencia anterior.

La llave maestra UNITED conserva la regla de Fase 1: abre puertas, pero NO elimina los cuartos de `usuario_zop`.

### 2. Bridge de alcance de registro

Archivo:

`backend/src/services/information-record-scope-gnral.service.js`

`buildTicketScopeSqlInline_gnral()` queda alineado con el builder parametrizado.

`requireTicketRecordScope_gnral()` consume automaticamente la nueva frontera sin cambiar contratos HTTP.

### 3. Lecturas humanas base de Tickets

Archivo nuevo:

`backend/src/modules/tickets/tickets-consultas_uni.js`

Se extraen dos lecturas:

- `getTickets_uni()`
- `getTicketDetalle_uni()`

Ambas incorporan el SQL territorial dentro de la consulta, no solo en middleware.

Se conserva el contrato actual de respuesta:

- lista: `{ ok, source: 'tickets', data }`;
- detalle: `{ ok, source: 'tickets', data }`.

La lista conserva `ORDER BY id DESC` y `LIMIT 50000` para no cambiar el comportamiento funcional en esta fase.

### 4. Repository

Archivo:

`backend/src/modules/tickets/tickets.repository.js`

Se enrutan a `_uni`:

- `getTickets`;
- `getTicketDetalle`.

Permanecen legacy deliberadamente:

- `getTicketInteracciones`;
- `createTicketComentario`;
- `saveTicketValidacion`;
- `saveTicketVobo`.

Estas acciones ya pasan por `requireTicketRecordScope_gnral` en las rutas existentes. No se duplico su logica porque contienen permisos, responsables, auditoria y notificaciones que no conviene reescribir durante una fase territorial.

### 5. M2M

Sin cambios:

- `/tickets/sync`;
- `/tickets/sync-fechas-cdmx`.

Siguen usando autenticacion de integracion y permanecen fuera del alcance humano.

## Archivos modificados/nuevos

- `backend/src/services/alcance/alcance-uni.service.js`
- `backend/src/services/information-record-scope-gnral.service.js`
- `backend/src/modules/tickets/tickets.repository.js`
- `backend/src/modules/tickets/tickets-consultas_uni.js` (nuevo)
- `backend/scripts/test-fase-3-tickets-cuartos-uni.js` (nuevo)
- `backend/scripts/test-alcance-uni.js` (actualiza expectativas del builder Ticket)
- `backend/scripts/test-fase-6-alcances.js` (actualiza expectativas del bridge Ticket)
- `ADR_FASE_3_UNI_TICKETS_CUARTOS_V001.md` (nuevo)

## No modificado

- SQL/Aiven;
- tabla `tickets`;
- `tickets.zona`;
- `usuario_zop`;
- `z_op`;
- frontend;
- permisos funcionales;
- comentarios/Vo.Bo./validaciones/notificaciones de Tickets;
- Sync/M2M;
- Portafolio de Fase 2.

## Validaciones realizadas

- `node --check` sobre todos los JS entregados: OK.
- `test-fase-3-tickets-cuartos-uni.js`: OK.
- `test-alcance-uni.js` actualizado y ejecutado sobre el sandbox acumulativo: OK.
- `test-fase-2-portafolio-cuartos-uni.js` ejecutado sobre Fase 3: OK.
- `test-fase-6-alcances.js` se actualizo para la nueva forma del SQL Ticket y paso `node --check`; no se ejecuto aislado porque el paquete incremental no incluye todas sus dependencias base.
- llave maestra + cuartos `[1,2]` conserva filtro territorial.
- llave maestra sin cuartos devuelve builder `1 = 0`.
- Ticket con `codigo_equipo` no puede caer al fallback por proyecto.
- Ticket sin codigo solo puede resolver por proyecto/proyecto_padre cuando el conjunto apunta a una sola zona estructurada.
- `tickets.zona` no participa en el SQL de autorizacion.
- `GET /tickets` incluye el alcance en el `WHERE`.
- detalle de Ticket incluye nuevamente el alcance dentro de su `SELECT`.
- repository conserva escrituras e integraciones en sus handlers actuales.

Resultado de prueba aislada:

```text
FASE_3_UNI_TICKETS_CUARTOS_V001: OK
```

## Validacion runtime requerida

No puedo confirmar esto contra la instancia Aiven real desde este entorno.

Despues de aplicar Fases 1 + 2 + 3:

1. asignar a un usuario solo algunos cuartos UNITED, por ejemplo `CNA-01`, `CNA-02`, `CNA-03`;
2. habilitar sus puertas funcionales de Operacion/Portafolio segun corresponda;
3. abrir una vista que consuma `GET /tickets` y confirmar que no devuelve Tickets de equipos fuera de esos cuartos;
4. abrir un Ticket autorizado y confirmar detalle/interacciones;
5. intentar abrir un Ticket de equipo fuera de alcance y confirmar `404`;
6. probar comentario y Vo.Bo. sobre Ticket permitido y sobre uno fuera de alcance;
7. probar un usuario con llave maestra pero solo algunos cuartos y confirmar que NO ve Tickets de otros cuartos;
8. revisar especificamente Tickets sin `codigo_equipo`: si el proyecto es territorialmente ambiguo deben quedar ocultos.

La Fase 4 puede continuar con la auditoria endpoint por endpoint de los demas modulos UNITED para asegurar que ninguna consulta humana de Operacion/Experimental omita el motor territorial.
