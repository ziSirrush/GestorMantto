# Propuesta Frontend · Ventas / Cotizaciones

Estado: **Propuesta para validación visual**  
Fecha: 28/07/2026

## Archivos modificados
- `index.html`
- `core/router.js`

## Archivos nuevos
- `modules/ventas-cotizaciones/ventas-cotizaciones.html`
- `modules/ventas-cotizaciones/ventas-cotizaciones.css`
- `modules/ventas-cotizaciones/ventas-cotizaciones.js`

## Alcance visual y funcional
- Listado principal con filtros, búsqueda, paginación y acciones.
- KPIs generales.
- Embudo.
- Vendidos.
- Perdidos.
- Proyección.
- Modal de nueva cotización y edición.
- Detalle lateral con Información, Comentarios y Archivos.
- Diseño responsive y aislado mediante prefijo `vc-`.

## Fuente de datos
El módulo intenta consumir los endpoints reales de `/api/ventas/cotizaciones`.
Si el backend no responde, activa automáticamente un **Modo propuesta** con datos demostrativos para permitir la validación del diseño. Este fallback debe retirarse o desactivarse antes de Producción.

## Nota de integración documental
El gestor muestra los metadatos almacenados por el backend. La carga física a Google Drive queda pendiente de conectar con el flujo de Drive definido para United.
