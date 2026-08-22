# FASE 9/11 - Portafolio > Movimientos de Portafolio por cuartos UNITED

## Objetivo

Cerrar el alcance territorial del modulo **Movimientos de Portafolio** para que la primera carga, filtros, detalle mensual e historico semanal se resuelvan desde backend con la cadena oficial:

`usuario_zop -> portafolio.zona_id -> z_op.id_zona -> z_op.zona`

Los campos `portafolio.zona_operativa`, `tickets.zona` y `row.zona` historico dentro de JSON no conceden acceso.

## Cambios

- Nueva primera llamada: `GET /api/portafolio/movimientos/inicial`.
- Guard exclusivo del modulo:
  - dominio `UNITED`;
  - agrupacion `PORTAFOLIO`;
  - permiso `PORTAFOLIO_MOVIMIENTOS_PORTAFOLIO_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`.
- Se elimina el fallback frontend a `/api/portafolio`.
- Comparativo mensual filtra y presenta zona mediante `p.zona_id -> z_op.zona`.
- El filtro Zona usa solo cuartos autorizados.
- El detalle de movimiento canoniza zona de Equipo, Proyecto y Tickets con `z_op`.
- El historico semanal deja de exigir acceso a todos los cuartos UNITED.
- Los cortes semanales se filtran por cuartos antes de responder:
  - cortes nuevos: usan `zona_id` historica guardada en `snapshot_json` y `movimientos_json`;
  - cortes antiguos sin `zona_id`: compatibilidad fail-closed por `equipo -> portafolio.zona_id` actual.
- El job semanal guarda desde esta fase:
  - `zona_id` canonica;
  - `zona` desde `z_op.zona`;
  - `zona_legacy` solo para diagnostico.
- No hay cambios de estructura de BD ni tablas nuevas.

## Archivos modificados/nuevos

- `modules/movimientos-portafolio/movimientos-portafolio.js`
- `backend/src/modules/portafolio/portafolio.routes.js`
- `backend/src/modules/portafolio/portafolio.controller.js`
- `backend/src/modules/portafolio/portafolio.repository.js`
- `backend/src/modules/portafolio/portafolio-movimientos_uni.js` (nuevo)
- `backend/src/jobs/portafolioCierreSemanal.job.js`
- `ADR_FASE_9_MOVIMIENTOS_SEMANALES_CUARTOS_V001.md`
- `PRUEBA_WORKBENCH_FASE_9_TESTER.sql`

## Dependencias de fases anteriores

Aplicar despues de Fase 7 y Fase 8. Los archivos de Portafolio incluidos preservan los cambios de Fase 7 en Dashboard Portafolio.

## Validaciones realizadas

- `node --check` sobre todos los JS entregados: OK.
- Mock runtime de carga inicial mensual: OK.
- Mock runtime de historico semanal filtrando un movimiento fuera de cuartos: OK.
- Mock runtime de detalle con zona canonica: OK.
- Mock runtime del job semanal verificando `zona_id`, `zona` y `zona_legacy` en JSON: OK.
- Confirmada en el snapshot SQL disponible la existencia de:
  - `portafolio.zona_id` FK a `z_op.id_zona`;
  - `portafolio.estatus_ul_mes`;
  - `portafolio.estatus_ul_mes_fecha`;
  - `portafolio.estatus_cobranza`;
  - `portafolio_cortes_semanales.snapshot_json`;
  - `portafolio_cortes_semanales.movimientos_json`.

## Resultado esperado con Tester 81

El modulo puede abrir con los cuartos activos del usuario. En las pruebas previas Tester tiene `CNA-01`, `CNA-02` y `CNA-03`. La zona presentada debe ser siempre la de `z_op.zona`; si un registro tiene `zona_operativa = CNA-04` pero `zona_id = 4`, el modulo debe presentar `CNA-01`.

## Limitacion verificable

Los cortes semanales existentes creados antes de esta fase no almacenan `zona_id` dentro del JSON segun el job actual del repositorio. Para esos cortes se usa una compatibilidad conservadora basada en la relacion estructurada actual del equipo. Si un equipo historico ya no existe en Portafolio, ese renglon queda oculto (fail-closed).

No puedo confirmar el comportamiento contra Aiven/Railway/Netlify hasta desplegar y probar con una sesion real.
