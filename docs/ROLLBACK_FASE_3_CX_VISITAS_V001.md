# BLT NOW — Rollback seguro · Customer Experience > Visitas · Fase 3 V001

Este rollback afecta **unicamente el frontend** de Fase 3. NO borrar las tablas `cx_visitas` / `cx_visitas_historial`, ni los endpoints/archivos backend de Fases 1/2. No modifica permisos, roles o datos.

## Antes de volver atras

1. Guardar cualquier trabajo posterior en un commit o rama; no usar `git restore` si hay cambios posteriores en `core/app.js` / `index.html` que se desean conservar.
2. Verificar en `git diff -- core/app.js index.html` que los cambios a revertir corresponden solo a la Fase 3.

## En un clon no commiteado que solo tiene el cambio de Fase 3

```powershell
# Ejecutar desde la raiz del repositorio.
git restore --source=c8923226b70f8bc63d13f14fc7390ba41599ddfc -- core/app.js index.html
# Quitar solo los nuevos activos de Fase 3, cuando no tengan cambios posteriores propios.
Remove-Item -Recurse -Force .\modules\customer-experience-visitas
Remove-Item -Force .\tools\apply-cx-visitas-fase3-v001.cjs
Remove-Item -Force .\tests\cx-visitas-fase3.test.cjs
Remove-Item -Force .\README_FASE_3_CUSTOMER_EXPERIENCE_VISITAS_FRONTEND_V001.md
Remove-Item -Force .\MANIFEST_FASE_3_CX_VISITAS_V001.txt
Remove-Item -Force .\docs\ROLLBACK_FASE_3_CX_VISITAS_V001.md
Remove-Item -Force .\docs\CHECKSUMS_FASE_3_CX_VISITAS_V001.sha256
```

Si se publicaron cambios, revertir el commit especifico de Fase 3 y republicar por el flujo normal de BLT NOW; **no usar HEAD anterior global si contiene trabajo ajeno**.

**No** restaurar/cambiar `backend/src/modules/customer-experience/customer-experience.routes.js` ni `backend/src/routes/index.js`: no son parte de esta fase. **No** borrar `/api/customer-experience/visitas`: corresponde a Fase 2.

## Verificacion despues de rollback

```powershell
git hash-object core/app.js
git hash-object index.html
git diff --check
```

Blobs esperados si se restauro exactamente la version base 101526.4:

- core/app.js: `9c857a6fedf488ff5bf6c2f311a6df0fcd4ddd24`
- index.html: `6c71db21ab191ba346d02c6460d0cd8a5fc53043`

Al volver a abrir `cx-visitas`, el router mostrara su destino previo de "En desarrollo" si es alcanzado. La ruta backend puede seguir existiendo, pero el frontend ya no la cargara.
