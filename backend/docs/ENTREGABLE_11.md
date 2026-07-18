# Entregable 11 - Modulo Tickets

## Objetivo

Separar las rutas del dominio Tickets dentro de `src/modules/tickets` sin
cambiar las URLs, middlewares, contratos JSON ni comportamiento actualmente
validado por el frontend.

## Archivos incluidos

- `src/modules/tickets/tickets.routes.js`
- `src/modules/tickets/tickets.controller.js`
- `src/modules/tickets/tickets.service.js`
- `src/modules/tickets/tickets.repository.js`
- `src/routes/data/tickets.routes.js`

## Rutas conservadas

- `GET /api/tickets`
- `GET /api/tickets/:ticket/interacciones`
- `POST /api/tickets/:ticket/comentarios`
- `POST /api/tickets/:ticket/validacion`
- `GET /api/tickets/:ticket`
- `POST /api/tickets/:ticket/vobo`
- `POST /api/tickets/sync`

## Middlewares conservados

- `optionalAuth` en interacciones y detalle.
- `requireAuth` en comentarios, validacion y Vo.Bo.
- Las rutas de listado y sincronizacion mantienen exactamente la configuracion
  previa del backend recibido.

## Estrategia transicional

El nuevo flujo es:

`routes -> controller -> service -> repository -> handlers legacy`

El repository utiliza temporalmente los handlers ya validados de
`src/controllers/data.controller.js`. Esto reduce el riesgo de regresiones y
permite validar primero el registro modular de las rutas.

## Importante

No eliminar todavia de `data.controller.js`:

- `getTickets`
- `getTicketInteracciones`
- `createTicketComentario`
- `saveTicketValidacion`
- `getTicketDetalle`
- `saveTicketVobo`
- `syncTickets`

La extraccion definitiva y el retiro del codigo legacy corresponden al
entregable de limpieza posterior a la validacion funcional.

## Validacion recomendada

1. Iniciar el backend.
2. Comprobar `/api/health`.
3. Confirmar listado de tickets.
4. Abrir el detalle de un ticket.
5. Revisar interacciones y comentarios.
6. Probar validacion y Vo.Bo. con un usuario autorizado.
7. Ejecutar sincronizacion solo en el entorno de prueba autorizado.
8. Validar los consumidores del detalle de ticket desde Resumen del Dia,
   Equipos Criticos, Proyectos y Portafolio.
