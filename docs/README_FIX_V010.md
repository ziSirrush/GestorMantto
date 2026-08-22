# FIX V010 — Nombre global de proyecto + Ir a MP

## Objetivo
1. Estandarizar la presentación de nombres de proyecto con forma de fecha, sin modificar el valor técnico usado para filtros, relaciones o navegación.
2. Corregir **Gestión de Crédito > Ir a MP** para abrir directamente el detalle de Mantenimiento Preventivo relacionado.

## Regla global
Ejemplo verificado:
- Valor técnico: `0197-09-16T06:36:36.000Z`
- Presentación: `16 de Septiembre #197`

Se agrega `core/project-name.js` y `window.ManttoFormat.projectName()` como única función frontend para esta regla.

## Archivos modificados
- `index.html`
- `core/project-name.js` (nuevo)
- `core/details.js`
- `modules/portafolio/portafolio.js`
- `modules/resumen-dia/resumen-dia.js`
- `modules/cobranza-uni/cobranza-uni.js`

## Ir a MP
El botón se habilita únicamente cuando la respuesta ya cargada de Gestión de Crédito contiene al menos un registro relacionado de `detalle_mp_2026` con `id_dmp` válido. Usa el primer `id_dmp` relacionado y abre la ruta existente `cobranza-uni-mp-pro` con el estado de detalle preparado. No agrega consultas nuevas ni loops de API.

## Optimización respetada
- No se agregan fetch dentro de loops.
- No se agregan timers ni listeners globales duplicados.
- Se reutiliza la respuesta de relaciones que Gestión de Crédito ya cargó.
- No se modifica Aiven ni se crean tablas.
- Los valores técnicos originales de proyecto se conservan para navegación y relaciones.
