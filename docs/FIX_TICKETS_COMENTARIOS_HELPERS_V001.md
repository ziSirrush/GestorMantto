# FIX Tickets Comentarios Helpers V001

Corrige el error HTTP 500 al crear comentarios en tickets.

## Causa

El controlador `data.controller.legacy.js` invocaba auxiliares no definidos:

- `findTicketRow`
- `createTicketNotifications`
- `ticketResponsibleNames`
- `ticketCanRevert`
- `ticketCanValidateRole`
- `ticketRoleNames`

## Archivo modificado

- `backend/src/controllers/data.controller.legacy.js`

## Validaciones

```powershell
node --check backend/src/controllers/data.controller.legacy.js
cd backend
npm run check
```
