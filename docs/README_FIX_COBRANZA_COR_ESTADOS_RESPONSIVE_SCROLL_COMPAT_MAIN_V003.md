# FIX COBRANZA COR - ESTADOS RESPONSIVE SCROLL COMPAT MAIN V003

Fecha: 24/09/2026
Base oficial revisada: `main` commit `8141956d49429bf66adf84e2476804f5264c62c1`.

## Objetivo
Compatibilizar `FIX_COBRANZA_COR_ESTADOS_RESPONSIVE_SCROLL_V002` con el ultimo `main` sin rehacer el FIX completo.

## Causa
Entre la base usada para V002 (`4315589d690b8f65b03fb05e63a5704b6d9a2b37`) y el `main` revisado (`8141956d49429bf66adf84e2476804f5264c62c1`) solo cambio, dentro del alcance del FIX, `core/module-loader.js`.

El commit nuevo actualizo las cinco rutas de Logistica Produccion a:
`20260924-pvo-preview-hoja1-v003`.

V002 aun llevaba esas cinco rutas con:
`20260924-pvo-doc-modal-responsive-v002`.

## Resultado V003
- Conserva en Cobranza COR los cache-bust de V002:
  - `cobranza-cor-estados-cuenta.css?v=20260924-estados-responsive-scroll-v002`
  - `cobranza-cor-estados-cuenta-form.css?v=20260924-estados-responsive-scroll-v002`
  - `cobranza-cor-estados-cuenta-form.js?v=20260924-fondo-garantia-general-v002`
- Conserva en Logistica Produccion la version del ultimo main:
  - `20260924-pvo-preview-hoja1-v003`
- No modifica CSS, JS funcional, backend, Aiven, rutas ni permisos.

## Orden de aplicacion
1. Aplicar completo `FIX_COBRANZA_COR_ESTADOS_RESPONSIVE_SCROLL_V002`.
2. Inmediatamente despues, sobrescribir con este V003.
3. Luego revisar `git diff`, probar y hacer commit/push conforme al flujo normal.

## Archivo funcional incluido
- `core/module-loader.js`

El paquete no contiene `.patch`, aplicadores, manifests ni scripts de despliegue.
