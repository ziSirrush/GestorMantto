# HOTFIX_INSTALACIONES_ADMINISTRACION_ONLY_FULL_GROUP_BY_V001

**Fecha:** 2026-10-09  
**Proyecto:** Gestor Mantto / Instalaciones > Administracion  
**Base oficial revisada:** `ziSirrush/GestorMantto`, `main`, `15287425b5a4e351eab746d17549238a11239051` (`Version 100926.1`).  
**Archivo corregido base (Git blob):** `04e6d0540bfbf3fd6c210f0686e93372c46b91f7`.  

## Diagnostico comprobado

La respuesta del backend es `ER_WRONG_FIELD_WITH_GROUP` bajo `sql_mode=ONLY_FULL_GROUP_BY`.
En `listProjects_cor()` del repositorio, se agrupaba por `project_key` y se ordenaba
con `COALESCE(proyecto, '')`. Dentro de esa expresion MySQL resuelve `proyecto`
como la columna base `f.proyecto`, no como el agregado `MIN(...) AS proyecto`.
Por eso la consulta era invalida bajo el modo estricto.

## Cambio minimo

Se reemplaza solamente el `ORDER BY` conflictivo:

Antes:
```sql
ORDER BY COALESCE(proyecto, '') ASC, project_key ASC
```

Despues:
```sql
ORDER BY COALESCE(MIN(NULLIF(TRIM(f.proyecto), '')), '') ASC, project_key ASC
```

La nueva expresion usa una agregacion y mantiene la semantica de orden ascendente,
el desempate por `project_key`, los filtros y la paginacion. **No es una migracion
SQL**: se corrige un `SELECT` generado por Node/Express.

## Archivos del ZIP

- `backend/src/modules/instalaciones-administracion/instalaciones-administracion.repository.js` (archivo completo modificado).
- `tests/instalaciones-administracion-hotfix-only-full-group-by.test.js` (regresion nueva offline).
- `README_HOTFIX_INSTALACIONES_ADMINISTRACION_ONLY_FULL_GROUP_BY_V001.md`.
- `MANIFEST_HOTFIX_INSTALACIONES_ADMINISTRACION_ONLY_FULL_GROUP_BY_V001.txt`.
- `SHA256SUMS_HOTFIX_INSTALACIONES_ADMINISTRACION_ONLY_FULL_GROUP_BY_V001.txt`.

## Aplicacion segura

1. Antes de extraer, verificar `git status` y comparar con `main`; NO sobrescribir
   cambios locales sin revisarlos. La base exacta de `repository.js` debe ser
   `04e6d0540bfbf3fd6c210f0686e93372c46b91f7`; si ha cambiado, detenerse y reconciliar.
2. Descomprimir en la raiz del repositorio local manteniendo las carpetas. Esto
   reemplaza UNICAMENTE el archivo Node indicado y agrega la prueba.
3. Ejecutar en PowerShell, desde la raiz del repositorio:

```powershell
git status
git diff --check
node --check .\backend\src\modules\instalaciones-administracion\instalaciones-administracion.repository.js
node --test .\tests\instalaciones-administracion-hotfix-only-full-group-by.test.js
```

4. Revisar el diff, actualizar el backend en Azure por el proceso autorizado,
   y volver a consultar `GET /api/instalaciones/administracion/proyectos`.
   No basta con subir frontend a GitHub Pages o Netlify.
5. Verificar por separado los tokens de cache del frontend: en el `main`
   revisado, `index.html` y `core/module-loader.js` aun anuncian la Fase 3,
   pese a que los FIX 1-4 estan presentes. No es la causa de este SQL error,
   pero debe resolverse para evitar un frontend desactualizado.

## Validaciones y limites

- Sin tablas, columnas, permisos, cambios de negocio o scripts SQL nuevos.
- Sintaxis Node y pruebas offline: ejecutar con el test incluido.
- **No se ha consultado Aiven/Azure** y no se puede certificar E2E ni el
  despliegue real. No ejecutar escrituras en GitHub/Aiven/Azure/Netlify sin
  autorizacion explicita.
- La falla se deduce de la respuesta SQL reportada por el usuario y del
  `main` verificado. El fix es localizado; los demas endpoints se mantienen.
