# ADR — FIX F3/F4 · Tickets · Permiso y puerta emparejados

## Estado
Aceptado para este FIX.

## Contexto
Las rutas humanas compartidas de Tickets aceptaban una lista global de permisos funcionales y una lista global de agrupaciones. El Guard General resolvía primero cualquier permiso válido y después cualquier puerta válida.

En una ruta consumida por Operación y Portafolio, esto permitía combinar accidentalmente un permiso funcional de una agrupación con la puerta informativa de otra. El filtro territorial UNITED por `usuario_zop` seguía aplicándose, pero el vínculo permiso ↔ agrupación no era estricto.

Experimental no forma parte de este flujo F3/F4. Su acceso no debe convertirse en una tercera alternativa funcional de Tickets.

## Decisión
Se agrega al Guard General una modalidad opt-in:

`groupingPermissionPairsAny`

Cada entrada contiene exactamente una agrupación y uno o más permisos funcionales válidos para esa misma agrupación.

Una solicitud solo avanza cuando existe, dentro del mismo par:

1. permiso funcional efectivo; y
2. puerta de información autorizada.

El modo histórico `permissionCode/permissionCodesAny + groupingCode/groupingCodesAny` se conserva sin cambios para las rutas no migradas.

Las rutas de lista y detalle de Tickets se migran únicamente a dos pares:

- `OPERACION` + permisos de Tickets de Operación.
- `PORTAFOLIO` + permiso de Tickets de Portafolio.

Experimental queda fuera de esos pares.

## Identificador del detalle
El detalle de Ticket se alinea con el record-scope y con `findTicketRow()` para aceptar las cuatro referencias existentes:

- `ticket`
- `id`
- `folio`
- `id_interno`

El predicado territorial continúa ejecutándose en la misma consulta.

## Consecuencias
- Un permiso Portafolio no puede combinarse con puerta Operación, ni viceversa.
- La llave maestra sigue resolviéndose por el mecanismo existente de puertas; no sustituye el permiso funcional.
- `usuario_zop -> z_op -> Portafolio/Ticket` sigue siendo la frontera territorial UNITED.
- No hay cambio de BD, frontend ni sincronizadores M2M.
- Las demás rutas del proyecto mantienen el comportamiento histórico del Guard hasta que se migren explícitamente.
