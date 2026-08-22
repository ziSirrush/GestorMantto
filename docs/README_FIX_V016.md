# FIX V016 — Versión visible para Programador

## Objetivo
Agregar una marca técnica discreta debajo de la frase del día para identificar con certeza la versión que está ejecutando el navegador.

## Visibilidad
Solo se muestra cuando el usuario efectivo tiene el rol exacto `Programador`.
No se habilita por acceso total, administrador, `Programador United` ni `Programador Corellian`.

## Local
En `localhost`, `127.0.0.1` o `::1` muestra:

`LOCAL · FIX V016`

## Deploy Netlify
Durante el build, `tools/generate-build-info.js` toma:
- `COMMIT_REF` provisto por Netlify (SHA del commit desplegado).
- El mensaje real de `git commit -m` mediante `git log -1 --pretty=%s <SHA>`.

La barra mostrará, por ejemplo:

`DEPLOY · V014 Cobranza relaciones por proyecto · 3f8a21c`

No se consulta GitHub desde el navegador y no se agrega polling.

## Archivos
- `index.html`
- `styles/base.css`
- `core/app.js`
- `core/build-info.generated.js` (nuevo)
- `tools/generate-build-info.js` (nuevo)
- `netlify.toml` (nuevo)

## Operación futura
Cada FIX local debe actualizar `localVersion` en `core/build-info.generated.js`.
En producción, el commit desplegado y su mensaje son la fuente de verdad.

## Backend / Aiven
Sin cambios.
