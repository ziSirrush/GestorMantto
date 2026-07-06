# Portafolio Aiven V0.2.1 - Fix backend

## Motivo
El backend reportaba:

`TypeError: argument handler must be a function`

en `backend/src/routes/data.routes.js:9`, causado cuando una ruta intenta usar un handler no exportado desde `data.controller.js`.

## Cambio aplicado
Se entrega nuevamente el par completo y consistente:

- `backend/src/controllers/data.controller.js`
- `backend/src/routes/data.routes.js`

El controller exporta las funciones existentes necesarias para rutas previas:

- `getTickets`
- `saveTicketVobo`
- `syncTickets`
- `getPortafolio`
- `syncPortafolio`
- `getEquipos`
- `getProyectos`
- `getPendientes`
- `getNotificaciones`
- `getActividadReciente`
- `getUsuarios`
- `getPermisos`
- `getRoles`
- `getZonas`
- `getUsuarioZop`

Y conserva las nuevas funciones de Portafolio:

- `getPortafolioFiltros`
- `getPortafolioDashboard`
- `getPortafolioEquipos`
- `getPortafolioEquipoDetalle`

## Validación realizada
Desde `/mnt/data/pruebas_work/backend`:

- `node -e "const c=require('./src/controllers/data.controller'); console.log(typeof c.syncTickets, typeof c.saveTicketVobo)"`
  - Resultado: `function function`
- `timeout 5 node server.js`
  - Resultado: servidor levantó correctamente en `http://localhost:3001`.

## Nota
Este fix no modifica frontend, Home, Resumen del Día, Equipos Críticos, CSS ni Nori.
