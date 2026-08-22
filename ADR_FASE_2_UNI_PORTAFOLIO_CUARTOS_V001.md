# ADR - FASE 2 UNITED · PORTAFOLIO POR CUARTOS V001

## Estado

Aprobado para implementacion incremental.

## Contexto

La Fase 1 establecio que:

- las puertas pertenecen a Alcance;
- los cuartos pertenecen a Usuarios > Zonas Op;
- `usuario_zop` es la autoridad territorial UNITED;
- `z_op` es el catalogo referencial;
- la llave maestra UNITED abre puertas, pero no ignora cuartos.

Sin embargo, el Guard por si solo no protege una consulta si el handler posterior ignora `req.informationAccess.zona_ids`.

Portafolio contiene `zona_id`, por lo que puede y debe aplicar el filtro estructurado directamente en SQL.

## Decision

Toda consulta humana de Portafolio que lea, agregue o construya catalogos a partir de `portafolio` debe incorporar el builder central:

`buildPortafolioScopeSql_gnral(req, alias)`

La condicion resultante es fail-closed y se basa en `portafolio.zona_id`.

No se usa `zona_operativa` como frontera primaria de autorizacion. El texto puede seguir utilizandose como filtro visual/manual, pero nunca sustituye el FK estructurado.

## Cortes semanales

Los cortes semanales son snapshots globales materializados. Sus totales y JSON historicos representan el dominio completo y no se deben recortar parcialmente en respuesta.

Por ello se adopta una segunda condicion para esos endpoints: el usuario debe poseer todos los `z_op.id_zona` activos mediante `usuario_zop`.

Una llave maestra no satisface esa condicion por si sola.

## Detalles

Un detalle de equipo UNITED debe consultar primero el equipo con el filtro territorial aplicado. No es suficiente comprobar acceso y luego ejecutar un segundo SELECT global por codigo.

Un detalle de proyecto debe construirse con el subconjunto de equipos autorizados. Los Tickets que no pueden asociarse a uno de esos equipos fallan cerrado hasta que la Fase 3 formalice `tickets.zona`.

## M2M

`/portafolio/sync` conserva autenticacion de integracion y no usa alcance humano.

## Consecuencias

Positivas:

- un usuario solo puede ver Portafolio de sus cuartos;
- KPIs, tablas y filtros usan la misma frontera;
- la llave maestra no desactiva el limite territorial;
- se elimina dependencia legacy para las consultas humanas donde el filtro era ignorado;
- snapshots globales no producen verdades historicas parciales.

Pendientes:

- Tickets debe resolver su propia zona en Fase 3;
- atributos de Ticket embebidos en Portafolio siguen sujetos a la auditoria de Fase 3;
- la Fase 4 auditara endpoint por endpoint que no exista una ruta UNITED sin motor territorial.
