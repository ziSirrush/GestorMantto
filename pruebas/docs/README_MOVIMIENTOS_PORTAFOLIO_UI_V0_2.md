# Movimientos de Portafolio UI v0.2

Fecha: 2026-07-07

## Cambios aplicados

- Se reemplazaron las tarjetas KPI con degradado por KPIs corporativos planos con indicador tipo semáforo/LED.
- Se cambió el lenguaje visual:
  - `DEGRADADO` se muestra como **Salida de servicio**.
  - `RECUPERADO` se muestra como **Regreso a servicio**.
  - `CAMBIO` se muestra como **Cambio operativo**.
- Al hacer clic en cualquier renglón de Movimientos de Portafolio se abre una ventana flotante de 3 secciones:
  1. Detalle del Proyecto.
  2. Detalle del Equipo.
  3. Tickets relacionados al equipo.
- Las ventanas de detalle mantienen enlaces navegables:
  - Proyecto → detalle de proyecto.
  - Equipo → detalle de equipo.
  - Ticket → detalle de ticket si el módulo correspondiente está disponible.
- Los KPIs abren ventana flotante con tabla filtrada. Al seleccionar un renglón dentro del modal se abre el mismo detalle de 3 secciones.

## Backend

Se agregó el endpoint:

```txt
GET /api/portafolio/movimientos/:codigo/detalle
```

Devuelve `equipo`, `proyecto` y `tickets` relacionados al equipo.

## Archivos modificados

- `pruebas/modules/movimientos-portafolio/movimientos-portafolio.html`
- `pruebas/modules/movimientos-portafolio/movimientos-portafolio.css`
- `pruebas/modules/movimientos-portafolio/movimientos-portafolio.js`
- `backend/src/routes/data.routes.js`
- `backend/src/controllers/data.controller.js`
