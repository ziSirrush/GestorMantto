# ADR - FASE 9/11 - Alcance territorial del historico semanal de Portafolio

## Estado

Aceptado para Fase 9/11.

## Contexto

`portafolio_cortes_semanales` almacena `snapshot_json` y `movimientos_json`. El job anterior construia ambos usando `portafolio.zona_operativa` y no persistia la FK `portafolio.zona_id`.

Las pruebas de Aiven ya demostraron que `zona_operativa` puede diferir de `portafolio.zona_id -> z_op.zona`, por lo que el texto historico no puede utilizarse como autoridad de seguridad.

## Decision

1. Los cortes nuevos guardaran `zona_id` y `zona` canonica desde `z_op` dentro del JSON, conservando `zona_legacy` solo para diagnostico.
2. Al consultar un corte nuevo, el backend autoriza cada renglon por la `zona_id` historica contra los cuartos actuales del usuario.
3. Para cortes antiguos sin `zona_id`, el backend resuelve el equipo contra el Portafolio actual ya filtrado por `usuario_zop`.
4. Si no puede resolverse de forma estructurada, el renglon no se entrega.
5. No se modifica el esquema de BD en esta fase.

## Consecuencias

- No se requiere acceso a todos los cuartos para consultar historico semanal.
- Los conteos semanales devueltos se recalculan sobre el universo autorizado y no exponen totales globales.
- Los cortes nuevos mantienen exactitud territorial historica mediante `zona_id`.
- Los cortes antiguos permanecen seguros, aunque un equipo eliminado del Portafolio actual puede quedar oculto.

## Alternativas descartadas

- Autorizar por `row.zona` o `portafolio.zona_operativa`: descartado por inconsistencia comprobada.
- Exigir todos los cuartos UNITED: descartado porque impide aplicar el alcance por usuario al modulo.
- Crear una tabla historica territorial nueva: no es necesaria para esta fase; el JSON existente puede guardar `zona_id` sin modificar el esquema.
