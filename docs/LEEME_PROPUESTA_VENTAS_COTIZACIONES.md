<<<<<<< HEAD
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
=======
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
>>>>>>> b39f76e (Ventas .4)
