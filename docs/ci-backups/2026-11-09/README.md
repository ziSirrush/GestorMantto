# BLT NOW — Respaldo y restauración de CI/CD (2026-11-09)

## Versión de referencia intacta

- Rama protegida manualmente: `backup/ci-before-selective-20261109`
- Commit de origen: `cb33a88051bb713576bd0b39899ca016b5d340f1`
- Workflows originales conservados en este directorio con extensión `.bak` para evitar que GitHub Actions los ejecute.
- Azure original: `main_mantto-gestor-api.yml.bak`
- Pages original: `pages.yml.bak`

## Rollback rápido del CI/CD, sin tocar otros módulos

Desde una copia de trabajo limpia en `main`:

```bash
git switch main
git pull --ff-only origin main
git restore --source=cb33a88051bb713576bd0b39899ca016b5d340f1 -- .github/workflows/main_mantto-gestor-api.yml .github/workflows/pages.yml
git add .github/workflows/main_mantto-gestor-api.yml .github/workflows/pages.yml
git commit -m "Version MMDDYY.N"
git push origin main
```

**Importante:** este procedimiento restaura únicamente los dos YAML anteriores;
no restaura código ni datos de Aiven, ni revierte otros commits. La versión
anterior volverá a desplegar backend y frontend con cada push a `main`,
como hacía originalmente.

Si se quiere volver al estado COMPLETO del proyecto, revisar primero los
commits posteriores al respaldo. No hacer `git reset --hard` ni
`git push --force` a `main`.

## Criterio de despliegues selectivos

- Cambios en el paquete web declarado por `tools/build-frontend.js`:
  pruebas frontend y publicación Pages exclusivamente.
- Cambios en `backend/**`: pruebas backend y publicación Azure exclusivamente.
- Ambos dominios: se ejecutan los dos workflows.
- Cambios en `tools/ci-run-tests.js`: ambos dominios por ser infraestructura común.
- Un YAML modificado: se ejecuta su propio workflow para validarlo.
- Un commit exclusivamente documental no lanza despliegues.
- `workflow_dispatch` permanece disponible en ambos.

Las pruebas de `tests/` con referencias a frontend y backend se consideran
contratos compartidos y pueden ejecutarse en ambos pipelines. No se publica
un artefacto distinto del correspondiente a cada componente.

## Sincronización de PC local

`tools/sync-local.ps1` permite actualizar una copia local limpia en la rama
`main` con `git fetch` y `git merge --ff-only`. Se detiene cuando existen
cambios sin guardar, otra rama activa o historial divergente. Para convertirlo
en actualización periódica se debe instalar una tarea programada en cada PC;
un workflow remoto no puede descargar archivos a una PC apagada o sin agente.

Uso manual en Windows PowerShell:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\sync-local.ps1 -RepoPath "C:\ruta\GestorMantto"
```

No programar la tarea hasta comprobar que la ruta local y credenciales de
`origin` correspondan al repositorio autorizado.
