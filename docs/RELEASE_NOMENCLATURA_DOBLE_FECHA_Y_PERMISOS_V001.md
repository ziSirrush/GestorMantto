# BLT NOW — Nomenclatura de commits y metadatos de despliegue

> Estado: este documento reemplaza la regla de “doble fecha” publicada el 09/11/2026.

## Nomenclatura oficial de commits

Todo commit de desarrollo en `ziSirrush/GestorMantto` usa:

```
Version MMDDYY.N
```

- `MMDDYY`: fecha de trabajo en `America/Mexico_City`.
- `N`: consecutivo entero global de todo el repositorio para ese día.
- El consecutivo no se divide por API, Frontend, módulo, persona ni tipo de cambio.
- Antes de publicar se revisa todo el historial del día para tomar el mayor `N` y usar el siguiente.
- No se reescribe historial publicado para corregir títulos anteriores sin autorización específica de force-push.

## Metadatos técnicos de despliegue

Los archivos siguientes continúan existiendo para identificar la pareja técnica desplegada de API/Frontend:

- `config/releases/api.json`
- `config/releases/frontend.json`

Su formato histórico `DDMMYY.N` es **metadato de despliegue**, no la nomenclatura del commit.

Por lo tanto, un commit correcto puede tener el título:

```
Version 111026.2
```

aunque los metadatos técnicos publicados indiquen, por ejemplo, API `101126.19` y Frontend `101126.3`.

## Validación CI

- `tools/release-version.js verify` valida que el commit actual use `Version MMDDYY.N` y que su fecha coincida con Ciudad de México.
- `tools/release-version.js verify-history` valida además el consecutivo global contra todo el historial.
- `.github/workflows/commit-version.yml` ejecuta esa validación global en cada push a `main`.
- Los workflows de Azure y Pages conservan sus filtros selectivos; ya no utilizan la doble fecha como título de commit.

Los commits históricos con nomenclatura anterior permanecen como evidencia; cambiar su mensaje modificaría el SHA y requeriría reescritura de historial.
