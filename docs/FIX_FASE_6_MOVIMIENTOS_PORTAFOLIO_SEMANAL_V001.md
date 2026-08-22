# FIX FASE 6 — Movimientos de Portafolio · Cortes Semanales V001

**Fecha:** 17/08/2026  
**Repositorio base:** `ziSirrush/GestorMantto` · `main`  
**Commit de referencia revisado:** `4c25d15cde9f530b7ba34b06e9087c661d1b9140`

## Objetivo

Asegurar que el histórico de Movimientos de Portafolio genere un corte semanal correspondiente a cada domingo vencido a partir de las **12:00 hrs, America/Mexico_City**, incluso cuando no existan movimientos.

Si el corte semanal contiene cero movimientos, el Histórico Semanal debe mostrar exactamente:

`SIN MOVIMIENTOS ESTA SEMANA`

## Diagnóstico confirmado

El job semanal ya existía y estaba inicializado desde el bootstrap, pero su ejecución dependía de que el proceso estuviera activo durante el domingo después de las 12:00. Si esa ventana se perdía, al llegar el lunes el job ya no intentaba recuperar el último corte dominical pendiente.

El guardado de un corte con cero movimientos ya era compatible con la estructura existente: `total_movimientos = 0` y `movimientos_json = []`.

## Cambios realizados

### `backend/src/jobs/portafolioCierreSemanal.job.js`

- Conserva la hora de negocio configurada: domingo 12:00, zona `America/Mexico_City` por defecto.
- Determina cuál es el último domingo cuyo corte ya debería existir.
- Si el backend arranca después de la hora programada y ese último corte está pendiente, intenta recuperarlo inmediatamente.
- Mantiene la comprobación periódica cada 30 segundos.
- La persistencia en Aiven continúa siendo la autoridad para determinar si la semana ya está cerrada.
- `runWeeklyClose()` puede registrar el domingo objetivo aunque la ejecución real ocurra posteriormente.
- `fecha_corte` conserva la fecha/hora real de ejecución; no se falsifica como si el proceso hubiera corrido el domingo cuando no ocurrió.
- No se crean cortes duplicados para una misma semana.

### `modules/movimientos-portafolio/movimientos-portafolio.js`

- Conserva el Histórico Semanal y sus filtros existentes.
- Cuando el corte seleccionado tiene `total_movimientos = 0`, muestra:
  - `SIN MOVIMIENTOS ESTA SEMANA` en el resumen del corte.
  - `SIN MOVIMIENTOS ESTA SEMANA` dentro de la tabla.
- Si el corte sí tuvo movimientos pero los filtros actuales dejan cero resultados, conserva el mensaje distinto:
  - `Sin movimientos para los filtros seleccionados`.
- No cambia el comportamiento del comparativo mensual.

## Archivos modificados

1. `backend/src/jobs/portafolioCierreSemanal.job.js`
2. `modules/movimientos-portafolio/movimientos-portafolio.js`

## Base validada antes del cambio

- `backend/src/jobs/portafolioCierreSemanal.job.js`
  - Git blob SHA: `bf268ca579288526274a490d494c3e555923ae1a`
- `modules/movimientos-portafolio/movimientos-portafolio.js`
  - Git blob SHA: `89866b582475ba6ba24b2c47d9eb2c52dc8f7889`

Ambos archivos usados como base coinciden byte a byte con los blobs obtenidos del `main` revisado.

## Validaciones realizadas

- `node --check backend/src/jobs/portafolioCierreSemanal.job.js` — **PASS**
- `node --check modules/movimientos-portafolio/movimientos-portafolio.js` — **PASS**
- Domingo 11:59 CDMX → todavía corresponde el domingo anterior — **PASS**
- Domingo 12:00 CDMX → habilita el corte del mismo domingo — **PASS**
- Lunes posterior → detecta el último domingo vencido para recuperación — **PASS**
- Cruce de año ISO → resuelto correctamente — **PASS**
- Semana sin cambios → persiste corte `CERRADO` con:
  - `total_movimientos = 0`
  - `total_salidas = 0`
  - `total_regresos = 0`
  - `total_cambios = 0`
  - `movimientos_json = []`
  — **PASS**
- Mensaje cero movimientos diferenciado del resultado vacío por filtros — **PASS**

## No modificado

- No hay cambios SQL.
- No hay tablas ni columnas nuevas.
- No se modifica `index.html`, router ni archivos compartidos `_gnral` adicionales.
- No se modifica la lógica mensual de Movimientos de Portafolio.
- No se modifica ningún módulo de Ventas, Instalaciones o Corellian.

## Limitación deliberada

Este FIX evita que vuelva a quedar pendiente el **último domingo vencido**, pero no inventa snapshots históricos de semanas antiguas que nunca fueron almacenados. Si una semana pasada no tuvo corte y ya transcurrieron semanas posteriores, no existe información suficiente para reconstruir con exactitud el estado que tenía Portafolio a las 12:00 de aquel domingo.

Cuando una recuperación ocurre después del domingo, el snapshot utilizado es el disponible en el momento real de recuperación y `fecha_corte` conserva ese instante real.

## Despliegue requerido

- **Backend:** sí, requiere redeploy para activar el scheduler corregido.
- **Frontend:** sí, requiere publicar el JS actualizado para mostrar el mensaje específico de semana sin movimientos.
- **SQL/Aiven:** no requiere despliegue de esquema.

No se realizó push ni deploy desde este FIX.
