# Movimientos Portafolio - Histórico semanal V001

## Cambios
- Se conserva el comparativo mensual existente en un panel contraíble.
- Se agrega un panel contraíble de histórico semanal.
- El histórico permite seleccionar año y semana ISO, buscar por proyecto/equipo y filtrar por tipo de movimiento.
- Se agregan endpoints para catálogo de semanas y consulta de un corte semanal.
- Se agrega job automático de corte dominical a las 12:00 hrs en `America/Mexico_City`.
- El primer corte crea la línea base; los siguientes comparan contra el snapshot semanal anterior.
- Cada semana se almacena en `portafolio_cortes_semanales` mediante `snapshot_json` y `movimientos_json`.

## Archivos modificados/nuevos
- `index.html`
- `modules/movimientos-portafolio/movimientos-portafolio.html`
- `modules/movimientos-portafolio/movimientos-portafolio.css`
- `modules/movimientos-portafolio/movimientos-portafolio.js`
- `backend/server.js`
- `backend/.env.example`
- `backend/src/routes/data.routes.js`
- `backend/src/controllers/data.controller.js`
- `backend/src/jobs/portafolioCierreSemanal.job.js`

## Validaciones
- Sintaxis de JavaScript frontend y backend.
- Registro de rutas y nombres exportados.
- Inicio de ambos jobs desde `server.js`.
- Programación dominical 12:00 CDMX.
- Restricción de una semana por `(anio_iso, semana_iso)` respetada por la lógica del job.
- No se modifica la lógica del corte mensual.

## Nota funcional
El corte semanal registra el cambio neto entre snapshots dominicales. Si un equipo cambia y regresa al mismo estado antes del siguiente corte, ese movimiento intermedio no aparecerá en el log semanal.
