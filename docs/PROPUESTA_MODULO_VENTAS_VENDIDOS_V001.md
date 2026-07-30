# Propuesta Ventas - Vendidos V001

## Alcance
- Módulo independiente `ventas-vendidos`.
- Sin tabs internos y sin modificar Cotizaciones.
- Datos exclusivos de Aiven mediante `GET /api/ventas/cotizaciones/vendidos`.
- Estatus fijo: `Vendido`.
- Año basado en `fecha_cierre`; año actual por defecto y opción Todos.
- Visibilidad reutilizada desde la regla general de Ventas.
- Filtros Asesor y Administrativo visibles solo para acceso total.

## KPI
- Ventas cerradas.
- Equipos vendidos.
- Con fecha de cierre.
- Sin fecha de cierre.

## Archivos nuevos
- `modules/ventas-vendidos/ventas-vendidos.html`
- `modules/ventas-vendidos/ventas-vendidos.css`
- `modules/ventas-vendidos/ventas-vendidos.js`

## Integración mínima
- `index.html`
- `core/router.js`

## Backend ajustado
- `ventas-cotizaciones.repository.js`
- `ventas-cotizaciones.service.js`

El ajuste del backend hace que el filtro anual de Vendidos use `fecha_cierre`, sin cambiar el filtro anual del módulo Cotizaciones.
