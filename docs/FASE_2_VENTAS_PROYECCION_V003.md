# Fase 2 · Ventas Proyección V003

## Objetivo

Mover al backend la paginación y los cálculos de cada etapa de Proyección, conservando los acordeones independientes aprobados en V002.

## Fuente

Todos los datos continúan saliendo exclusivamente de `ventas_cotizaciones_cor`.

## Cambios

- Paginación real en backend por cada etapa.
- El frontend ya no descarga todas las cotizaciones de Proyección.
- La primera carga devuelve únicamente la primera página de cada etapa.
- Al cambiar de página solo se consulta la etapa seleccionada.
- Conteos de cotizaciones y equipos calculados en Aiven.
- Filtros de búsqueda, año, asesor, administrativo y zona ejecutados en backend.
- Alcance comercial resuelto por el servicio de visibilidad existente.
- Acordeones independientes; pueden permanecer varios expandidos.
- Navegación al Detalle de Cotización global.

## Etapas

1. 🟠 En Contrato
2. 🟢 Asignado
3. Pre Asignado
4. 🕓 En Espera de Definicion
5. 🟡 Seguimiento con Probabilidad

## Base de datos

No agrega ni modifica tablas o columnas.
