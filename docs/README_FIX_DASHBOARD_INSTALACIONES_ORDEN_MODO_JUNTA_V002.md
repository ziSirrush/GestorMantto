# FIX Dashboard Instalaciones - Orden Modo Junta V002

Fecha: 2026-08-19
Estado: Pruebas

## Objetivo

Reorganizar unicamente el orden visual de las secciones del Dashboard de Instalaciones en Modo Junta.

Orden solicitado:

1. Reporte de instalaciones por seccion.
2. Documentacion Pendiente.
3. Cobranza Corellian.

## Cambio aplicado

- Se movio el bloque `idb-cor-report-card` antes de `idb-cor-documentation-card`.
- Se actualizaron los indicadores visuales de paso: Reporte pasa a 2 y Documentacion pasa a 3.
- Cobranza Corellian conserva su posicion posterior a ambas secciones.
- No se modificaron consultas, calculos, filtros, permisos, endpoints ni reglas de negocio.
- Modo normal conserva su comportamiento funcional actual.

## Archivos modificados en esta revision

- `modules/instalaciones-dashboard/instalaciones-dashboard_cor.html`
- `modules/instalaciones-dashboard/instalaciones-dashboard_cor.js` (solo version/cache del modulo)
- `index.html` (solo cache-bust de Dashboard Instalaciones)

## Base acumulativa conservada

Este FIX parte de `FIX_DASHBOARD_INSTALACIONES_DOCUMENTACION_MODO_JUNTA_V001` y conserva sus cambios, incluido el FIX previo de renovacion silenciosa de sesion.

## Validaciones

- Orden HTML validado: Reporte -> Documentacion -> Cobranza Corellian.
- Sintaxis JavaScript validada con `node --check`.
- Se verifico que no existan cambios en backend respecto al FIX V001.
- No requiere SQL.
