# FASE 3 — INSTALACIONES · ADMINISTRACIÓN — FRONTEND BASE V001

## Base verificada

- Repositorio: `ziSirrush/GestorMantto`
- Rama: `main`
- Commit: `d19fc8d575c7fe9d2a91c7630ea676180487c18e`
- Versión: `Version 100826.2`
- Prerrequisitos: Fase 1 + Fase 2 de Instalaciones · Administración.

## Objetivo

Integrar el frontend base de **Instalaciones · Administración** sin habilitar todavía edición/guardado. La vista consume el backend de Fase 2 únicamente en lectura.

## Implementado

- Nuevo acceso **Administración** dentro de Instalaciones.
- El acceso usa el permiso exacto `INSTALACIONES_ADMINISTRACION_ACCESO_VISUAL_MODULO.ACCESO_VISUAL`; si el catálogo/permisos de Fase 2 no existen o no están concedidos, el sidebar permanece cerrado.
- Nueva ruta `instalaciones-administracion` integrada al Router y Module Loader actuales.
- Buscador por proyecto/equipo usando `/api/instalaciones/administracion/registros`.
- Apertura de detalle usando `/api/instalaciones/administracion/registros/:id`.
- Contrato de grupos/permisos leído desde `/api/instalaciones/administracion/contrato`.
- Cabecera fija del registro seleccionado.
- Selector de grupos y acordeón de información.
- Solo se muestran grupos con `can_view=true` devueltos por backend.
- Se distingue `can_edit`, pero Fase 3 no envía mutaciones.
- Campos de política pendiente se muestran como tales.
- `id_ins_fl`, `created_at` y `updated_at` quedan en Información del sistema / solo lectura.
- Responsive para escritorio, tablet y móvil.

## Archivos modificados

```text
index.html
core/module-loader.js
core/router.js
```

## Archivos nuevos

```text
modules/instalaciones-administracion/instalaciones-administracion_cor.html
modules/instalaciones-administracion/instalaciones-administracion_cor.css
modules/instalaciones-administracion/instalaciones-administracion_cor.js
tests/instalaciones-administracion-fase3-frontend-base.test.js
BASE_MAIN_VALIDADA_FASE_3_INSTALACIONES_ADMINISTRACION_V001.txt
README_FASE_3_INSTALACIONES_ADMINISTRACION_FRONTEND_BASE_V001.md
MANIFEST_FASE_3_INSTALACIONES_ADMINISTRACION_FRONTEND_BASE_V001.txt
SHA256SUMS.txt
```

## Qué NO hace Fase 3

- No ejecuta `POST`, `PUT`, `PATCH` ni `DELETE` desde este módulo.
- No guarda cambios en `ins_fl`.
- No crea SQL ni tablas.
- No asigna permisos a usuarios/roles.
- No usa `localStorage` ni `sessionStorage` para persistir datos del módulo.
- No modifica backend.

## Orden recomendado

1. Tener aplicadas Fases 1 y 2.
2. Aplicar el SQL de permisos de Fase 2 en el entorno autorizado, si aún está pendiente.
3. Extraer este ZIP sobre la raíz del repositorio.
4. Revisar `git status`, `git diff --check` y `git diff`.
5. Ejecutar `node --test tests/instalaciones-administracion-fase3-frontend-base.test.js`.
6. Asignar el permiso de acceso únicamente al usuario/rol de prueba desde Panel de Control.
7. Validar visualmente en Local/GitHub Pages según el flujo habitual antes de producción.

## Validaciones ejecutadas

- Baseline de `index.html`, `core/module-loader.js` y `core/router.js` verificado contra el `main` indicado mediante SHA Git blob.
- `node --check` de los 3 JS modificados/nuevos: PASS.
- Pruebas estáticas de Fase 3: PASS.
- No se ejecutó prueba E2E contra backend desplegado.
- No se consultó ni modificó Aiven durante la preparación.

## Pendiente

- **Fase 4:** formularios y guardado parcial por grupo.
- **Fase 5:** integración y QA final.

## Sistemas no modificados

Esta preparación no modificó GitHub, Aiven, Azure, Netlify ni Google Sheets.
