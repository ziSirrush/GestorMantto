# FIX V016.1 — Versión visible sin regresión de Cobranza United

## Base acumulativa
Construido directamente sobre `Pre deploy Cobranza Uni.zip` validado el 14/08/2026.

## Corrección
El V016 anterior incluía un `index.html` obsoleto y podía regresar la etiqueta `Aditivas` y eliminar `Mantenimiento Preventivo`. V016.1 descarta ese `index.html` antiguo y aplica únicamente el indicador de versión sobre la versión acumulativa vigente.

## Cobranza United preservado
- Dashboard Cobranza
- Gestión de Crédito
- Mantenimiento Preventivo
- Venta Adicional
- Ruta `cobranza-uni-mp-pro`
- Vista `view-cobranza-uni-mp-pro`
- Permiso `cobranza_uni_mantenimiento_preventivo`

## Indicador
Solo rol exacto `Programador`.
- Local: `LOCAL · FIX V016.1`
- Deploy: `DEPLOY · <mensaje git commit -m> · <SHA corto>`

## Archivos
- index.html
- styles/base.css
- core/app.js
- core/build-info.generated.js
- tools/generate-build-info.js
- netlify.toml

Sin cambios backend/Aiven.
