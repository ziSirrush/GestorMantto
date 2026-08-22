# FIX V010.1 — Restauración Mantenimiento Preventivo en Cobranza United

## Causa confirmada
El `index.html` incluido en V010 provenía de una base anterior a la incorporación de Mantenimiento Preventivo. Al reemplazarlo, regresó el sidebar a tres módulos (`Dashboard Cobranza`, `Estados de Cuenta`, `Aditivas`) y eliminó el contenedor `view-cobranza-uni-mp-pro`. Por eso Mantenimiento Preventivo desapareció del panel lateral y la navegación terminó en una vista sin contenedor / fallback de construcción.

## Cambio aplicado
- Se conserva íntegro el `index.html` de V010, incluyendo `core/project-name.js` y sus versiones de scripts.
- Se restaura la agrupación Cobranza United con cuatro módulos:
  1. Dashboard Cobranza
  2. Gestión de Crédito
  3. Mantenimiento Preventivo
  4. Venta Adicional
- Se restaura el contenedor `view-cobranza-uni-mp-pro`.
- Se conserva el `data-permission="cobranza_uni_mantenimiento_preventivo"` ya registrado en permisos.
- Se actualiza únicamente el query string del CSS Cobranza a la versión del módulo actual para evitar servir estilos antiguos desde caché.

## Archivos modificados
- `index.html`

## No se modifica
- Backend
- Aiven / SQL
- `modules/cobranza-uni/cobranza-uni.js`
- Formateador global de nombres de proyecto de V010
- Lógica del botón Gestión de Crédito → Ir a MP de V010
