# ADR - FASE 3 UNITED · TICKETS POR CUARTOS V001

## Estado

Aprobado para implementacion incremental.

## Contexto

Fase 1 separo Puertas y Cuartos:

- las puertas se resuelven en Alcance;
- los cuartos se resuelven desde `usuario_zop`;
- llave maestra abre puertas, pero no ignora cuartos.

Fase 2 aplico esa frontera a Portafolio usando `portafolio.zona_id`.

Tickets no tiene `zona_id` ni FK directa a `z_op`. Su columna `zona` es texto. La estructura disponible si contiene relaciones operativas con Portafolio mediante `codigo_equipo`, `proyecto` y `proyecto_padre`.

## Decision

No usar `tickets.zona` como frontera de autorizacion.

La Zona Operativa efectiva de un Ticket se deriva de Portafolio con precedencia fail-closed.

### Prioridad 1 - codigo de equipo

Si existe `tickets.codigo_equipo`, solo una coincidencia exacta con `portafolio.numero_equipo` puede autorizar el Ticket.

No se permite fallback por proyecto cuando el codigo esta presente.

### Prioridad 2 - proyecto

Solo cuando `codigo_equipo` esta vacio se consideran `proyecto` y `proyecto_padre`.

Ambos se tratan como referencias alternativas del mismo registro. Todas las filas Portafolio coincidentes deben resolver a una sola `zona_id`, sin valores nulos.

Si el conjunto es ambiguo o cruza zonas, se niega el registro.

### Cuarto autorizado

La zona estructurada resultante debe estar dentro de los `zona_ids` resueltos desde `usuario_zop` para el usuario efectivo.

La llave maestra no cambia esta condicion.

## Lecturas

`GET /tickets` y el detalle base dejan de depender del handler legacy para su SELECT principal y aplican el alcance directamente en SQL.

Los middlewares de registro se mantienen como defensa adicional.

## Escrituras e interacciones

Comentarios, Vo.Bo., validaciones e interacciones conservan su implementacion legacy actual para no duplicar reglas de negocio, notificaciones ni auditoria.

Su acceso sigue pasando antes por `requireTicketRecordScope_gnral`, que desde esta fase utiliza la frontera endurecida.

## M2M

Los sincronizadores de Tickets siguen fuera del alcance humano y usan autenticacion de integracion.

## Consecuencias

Positivas:

- no se confia en texto libre de zona para seguridad;
- un equipo fuera de alcance no puede entrar por coincidencia de proyecto;
- proyectos territorialmente ambiguos fallan cerrados;
- lista y detalle base quedan filtrados en su propia consulta;
- se conserva la logica estable de comentarios, Vo.Bo. y notificaciones;
- no se requiere migracion SQL.

Costos/pendientes:

- Tickets antiguos sin codigo y con proyectos repartidos en varias zonas quedaran ocultos por seguridad;
- una futura homologacion formal de `tickets.zona` podria mejorar cobertura, pero debe validarse con datos reales antes de cambiar esta regla;
- los demas modulos UNITED que consultan `tickets` directamente deben auditarse en Fase 4.
