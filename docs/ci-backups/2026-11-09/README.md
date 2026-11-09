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

## Sincronización de PC local — dos rutas oficiales

El script `tools/sync-local.ps1` usa **únicamente** los destinos autorizados:

- T14s: `C:\Users\T14s\Downloads\mantto_gestor_frontend`
- poock: `C:\Users\poock\Desktop\Publicada\mantto_gestor_frontend`

Detecta la ruta que existe en el equipo, valida que sea **la raíz del clon Git
ziSirrush/GestorMantto**, que `origin` sea el correcto y que la rama sea `main`.
Si solo hay archivos copiados manualmente (sin carpeta `.git`), falla sin
sobrescribir nada. No se ha podido confirmar remotamente la estructura real
de esas carpetas; se debe verificar en cada PC.

### Uso manual

Desde PowerShell, en el equipo correspondiente:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\T14s\Downloads\mantto_gestor_frontend\tools\sync-local.ps1"
```

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\poock\Desktop\Publicada\mantto_gestor_frontend\tools\sync-local.ps1"
```

### Activación periódica opcional (solo tras verificar cada equipo)

La opción `-InstallTask` registra una tarea del usuario actual que revisa
`main` cada **30 minutos mientras la sesión de Windows está iniciada**.
La instalación no se ejecuta desde GitHub: se debe activar una vez en cada PC.

En T14s:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\T14s\Downloads\mantto_gestor_frontend\tools\sync-local.ps1" -InstallTask
```

En poock:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\poock\Desktop\Publicada\mantto_gestor_frontend\tools\sync-local.ps1" -InstallTask
```

Para desinstalar, sustituir `-InstallTask` por `-RemoveTask`. Para ejecutar
una actualización inmediatamente, omitir ambos.

La sincronización utiliza `git fetch` + `git merge --ff-only`, transfiere
diferencias de Git y **no sobrescribe cambios sin guardar**, no hace
`reset --hard`, no usa `force` y no crea ni elimina archivos fuera de lo
versionado en ese repositorio. Un error de red o un conflicto detiene esa
ejecución sin sustituir forzosamente la versión local.

**No iniciar la tarea hasta comprobar que cada carpeta sea un clon Git
válido y que cuente con acceso a `origin`.**
