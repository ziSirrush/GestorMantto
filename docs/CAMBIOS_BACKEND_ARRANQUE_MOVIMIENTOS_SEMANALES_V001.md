# Fix Backend Arranque - Movimientos Semanales V001

## Causa encontrada

`src/routes/data.routes.js` registraba estas rutas:

- `GET /api/portafolio/movimientos-semanales/catalogo`
- `GET /api/portafolio/movimientos-semanales`

pero `src/controllers/data.controller.js` no exportaba ni contenía:

- `getPortafolioSemanasDisponibles`
- `getPortafolioMovimientosSemanales`

Express recibía `undefined` como handler y detenía el proceso antes de `app.listen()`, causando `ContainerTimeOut` en Azure.

## Cambio aplicado

Se agregaron y exportaron ambos controladores:

- Catálogo de cortes cerrados, ordenados por año y semana ISO.
- Consulta de un corte semanal por año y semana.
- Filtro en memoria del JSON semanal por proyecto/código y tipo de movimiento.
- Validación de año ISO y semana ISO.
- Respuestas 400, 404 y 500 controladas.

## Archivos modificados

- `backend/src/controllers/data.controller.js`

## Validaciones realizadas

- `node --check` en controlador, rutas, job semanal y `server.js`.
- Arranque real de `node server.js`.
- Confirmado que el proceso llega a `app.listen()`.
- Confirmado inicio de jobs mensual y semanal.
- `/api/health` respondió; la consulta a Aiven no pudo resolverse en este entorno por DNS `EAI_AGAIN`, pero Express quedó escuchando correctamente.
- No se modificaron autenticación, sesión, CORS, frontend ni variables de entorno.
