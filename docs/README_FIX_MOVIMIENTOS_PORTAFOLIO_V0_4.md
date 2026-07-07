# Fix Movimientos de Portafolio v0.4

Fecha: 2026-07-07

## Cambios incluidos

### Frontend
- Movimientos de Portafolio muestra `estatus_anterior` y `estatus_actual` correctamente.
- La fecha de corte se muestra en formato `DD/MM/AAAA`.
- Las tablas muestran el nombre visual del proyecto (`proyecto_nombre`) y conservan el código interno para abrir detalle.
- Click en KPI abre ventana flotante filtrada.
- Click en renglón abre ventana flotante de 3 secciones:
  1. Detalle del Proyecto
  2. Detalle del Equipo
  3. Tickets relacionados al equipo
- Click en Proyecto abre el detalle del proyecto.
- Click en Equipo abre el detalle del equipo.
- Click en Ticket abre el detalle del ticket cuando esté disponible.

### Backend
- `/api/portafolio/movimientos` ahora devuelve `proyecto_codigo`, `proyecto_nombre`, `estatus_anterior`, `estatus_actual`, `fecha_corte` y `tipo_movimiento`.
- `/api/portafolio/movimientos/:codigo/detalle` hereda `proyecto_codigo` y `proyecto_nombre` desde el select base.
- Se agregó job automático de cierre mensual de portafolio.

## Cierre mensual automático

Archivo nuevo:

```text
backend/src/jobs/portafolioCierreMensual.job.js
```

Comportamiento:

- Corre automáticamente el último día de cada mes a las 23:59.
- Zona horaria por defecto: `America/Mexico_City`.
- Copia `estatus_servicio` hacia `estatus_ul_mes`.
- Actualiza `estatus_ul_mes_fecha` con la fecha del cierre.

Variables opcionales:

```env
PORTAFOLIO_CIERRE_MENSUAL_ENABLED=true
PORTAFOLIO_CIERRE_TZ=America/Mexico_City
PORTAFOLIO_CIERRE_HOUR=23
PORTAFOLIO_CIERRE_MINUTE=59
```

Para desactivarlo temporalmente:

```env
PORTAFOLIO_CIERRE_MENSUAL_ENABLED=false
```

## Archivos modificados

- `pruebas/index.html`
- `pruebas/modules/movimientos-portafolio/movimientos-portafolio.js`
- `backend/server.js`
- `backend/src/controllers/data.controller.js`
- `backend/src/jobs/portafolioCierreMensual.job.js`
