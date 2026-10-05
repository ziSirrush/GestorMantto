# Movimientos Criticos - Backend V001

Fecha: 2026-10-03
Repositorio base revisado: `ziSirrush/GestorMantto`
Rama: `main`
Commit base: `e5d0d3f5b7ab4bf85a3ed7d89557ee9566068a0c` (`Version 100226.9`)

## Alcance

Backend independiente para el modulo **Operacion > Movimientos Criticos**.
No modifica Movimientos Portafolio ni reutiliza `portafolio_cortes_semanales`.

Se asume que la tabla `criticos_cortes_semanales` ya existe con la estructura acordada.

## Regla funcional V001

- Critico corporativo: `>= 3` fallas BLT dentro de U35.
- `ENTRA_CRITICO`: corte anterior `< 3` y corte actual `>= 3`.
- `SALE_CRITICO`: corte anterior `>= 3` y corte actual `< 3`.
- Equipos nuevos respecto al corte anterior no generan movimiento por falta de estado comparable.
- Equipos que desaparecen del universo evaluable tampoco se interpretan automaticamente como salida de critico.
- Primer corte: linea base, sin movimientos.

## Programacion

Valores por defecto:

- Domingo 12:00
- Zona: `America/Mexico_City`
- Revision interna: 30 segundos
- Recuperacion del ultimo domingo vencido pendiente
- Reintento tras error: 5 minutos

Variables opcionales:

- `CRITICOS_CIERRE_SEMANAL_ENABLED`
- `CRITICOS_CIERRE_SEMANAL_TZ`
- `CRITICOS_CIERRE_SEMANAL_HOUR`
- `CRITICOS_CIERRE_SEMANAL_MINUTE`
- `CRITICOS_CIERRE_SEMANAL_INTERVAL_MS`

## Endpoints

Base: `/api/movimientos-criticos`

- `GET /semanas`
- `GET /?anio=<YYYY>&semana=<N>&tipo=<ENTRA_CRITICO|SALE_CRITICO>&zona_id=<ID>&search=<texto>`
- `GET /snapshot?anio=<YYYY>&semana=<N>&solo_criticos=true`
- `POST /corte` - solo Programador

Los registros historicos se filtran contra el alcance UNITED/ZOP efectivo del usuario usando el Portafolio actual como frontera territorial.

## Permiso V001

Como esta entrega es **solo backend** y todavia no existe el catalogo visual/funcional del nuevo modulo, las rutas reutilizan temporalmente el permiso existente:

`OPERACION_EQUIPOS_CRITICOS_EQUIPOS_CRITICOS_EQUIPOS_CRITICOS.VER`

Esto evita abrir una ruta sin guard. Cuando se cree el modulo frontend y su permiso `ACCESO_VISUAL` propio, debe sustituirse esta puerta temporal.

## Archivos

Nuevos:

- `backend/src/jobs/movimientosCriticosCierreSemanal.job.js`
- `backend/src/modules/movimientos-criticos/movimientos-criticos.service.js`
- `backend/src/modules/movimientos-criticos/movimientos-criticos.controller.js`
- `backend/src/modules/movimientos-criticos/movimientos-criticos.routes.js`

Modificados:

- `backend/src/bootstrap.js`
- `backend/src/routes/index.js`

## No realizado

- No se hizo push a GitHub.
- No se hizo deploy en Azure.
- No se ejecuto SQL sobre Aiven.
- No se creo ni modifico frontend.
- No se modifico Movimientos Portafolio.
