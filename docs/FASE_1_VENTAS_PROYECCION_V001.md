# Fase 1 · Ventas Proyección V001

## Base funcional

La vista toma la lógica de la pestaña Proyección del módulo de Desarrollo y la integra como módulo independiente en la plantilla general de Mantto Gestor.

## Fuente de datos

Todos los registros se consultan exclusivamente desde `ventas_cotizaciones_cor` mediante:

`GET /api/ventas/cotizaciones/proyeccion`

No agrega tablas ni columnas.

## Etapas y presentación

1. `🟠 En Contrato` · peso 1
2. `🟢 Asignado` · peso 2
3. `Pre Asignado` · peso 3
4. `🕓 En Espera de Definicion` · peso 4
5. `🟡 Seguimiento con Probabilidad` · peso 5

Los emojis son únicamente visuales. La consulta conserva los valores reales sin emoji de `estatus_proyecto`.

## Funcionalidad incluida

- Ruta lateral `ventas-proyeccion`.
- Indicadores por etapa.
- Búsqueda y filtros de año, asesor, administrativo, zona y etapa.
- Agrupación por etapa con paginación local de 10 registros.
- Visibilidad comercial existente por usuario.
- Navegación de cada renglón al Detalle de Cotización global.
- Diseño responsive y semáforo de conexión.

## Archivos modificados

- `index.html`
- `core/router.js`
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.repository.js`
- `backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.service.js`

## Archivos agregados

- `modules/ventas-proyeccion/ventas-proyeccion.html`
- `modules/ventas-proyeccion/ventas-proyeccion.css`
- `modules/ventas-proyeccion/ventas-proyeccion.js`
