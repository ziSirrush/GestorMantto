# FIX Ventas - Cotizaciones V002

## Corrección aplicada

Se eliminó completamente el modo demostración del módulo. El frontend consume únicamente la API configurada en `window.MANTTO_API_BASE` y presenta datos procedentes del backend/Aiven.

## Comportamiento ante errores

- No se generan registros de muestra.
- No se simulan KPIs, cotizaciones, comentarios, archivos, altas ni ediciones.
- Si una ruta falla, el módulo muestra el mensaje devuelto por la API.
- Las tablas permanecen vacías hasta recibir información real.

## Rutas consumidas

- `GET /api/ventas/cotizaciones`
- `GET /api/ventas/cotizaciones/:id`
- `GET /api/ventas/cotizaciones/catalogos`
- `GET /api/ventas/cotizaciones/kpis`
- `GET /api/ventas/cotizaciones/embudo`
- `GET /api/ventas/cotizaciones/vendidos`
- `GET /api/ventas/cotizaciones/perdidos`
- `GET /api/ventas/cotizaciones/proyeccion`
- `GET/POST /api/ventas/cotizaciones/:id/comentarios`
- `GET /api/ventas/cotizaciones/:id/archivos`
- `POST/PUT /api/ventas/cotizaciones`

## Archivos modificados

- `modules/ventas-cotizaciones/ventas-cotizaciones.js`
- `modules/ventas-cotizaciones/ventas-cotizaciones.css`
- `docs/LEEME_PROPUESTA_VENTAS_COTIZACIONES.md`
