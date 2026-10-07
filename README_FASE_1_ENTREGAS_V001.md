# FASE 1 — ENTREGAS V001 · ENTREGA CORREGIDA

## Estado de esta entrega

Paquete de implementación **Backend + Frontend** para la agrupación `Entregas`, preparado según las normas vigentes de Mantto Gestor: archivos completos, solo archivos del alcance, estructura de carpetas conservada, validaciones documentadas y sin depender de fragmentos o `.patch`.

Este paquete **sustituye** a la entrega anterior `FIX_FASE_1_ENTREGAS_V001.zip` que utilizaba un `.patch` como mecanismo de aplicación.

- Repositorio objetivo: `ziSirrush/GestorMantto`
- Rama objetivo: `main`
- Commit base verificado: `578913484440865e56044601b8e85ab62367f9c9`
- Versión base: `Version 100726.1`
- Fecha de preparación: 07/10/2026

**No se modificó GitHub, Aiven, Azure ni Netlify al preparar este paquete.**

## Prerrequisito

Antes de desplegar Fase 1 debe haberse aplicado y validado `FASE_0_ENTREGAS_V001`.

Fase 1 espera que existan en Aiven:

- `entregas_programadas`
- `entregas_instancias`
- agrupación `ENTREGAS`
- módulo `ENTREGAS_CONTROL`
- catálogo de permisos de Entregas
- acción `VALIDAR`

Fase 1 **no contiene SQL** y no crea ni altera tablas.

## Alcance funcional

```text
📬 Entregas
└── 📋 Control de Entregas
    ├── Programadas
    ├── Mis Entregas
    ├── Validación
    └── Indicadores
```

### Programadas

- alta de una entrega para un colaborador;
- recurrencia `UNICA`, `SEMANAL`, `QUINCENAL` o `MENSUAL`;
- detalle de ocurrencias;
- resumen de cumplimiento;
- acceso al archivo entregado;
- desactivación lógica por el responsable.

### Mis Entregas

- listado del colaborador autenticado;
- estado calculado `A_TIEMPO`, `TARDE`, `NO_ENTREGADO` o `PENDIENTE`;
- carga/reemplazo de archivo;
- motivo de rechazo visible;
- acceso al archivo cargado.

### Validación

- revisión por el responsable que programó la entrega;
- acceso al archivo;
- válido/rechazado;
- comentario de validación.

### Indicadores

- porcentaje a tiempo;
- porcentaje general;
- porcentaje no entregado;
- desglose por colaborador.

## Recurrencia conservada de LAB INT-7

- `UNICA`: una ocurrencia.
- `SEMANAL`: +7 días.
- `QUINCENAL`: +15 días.
- `MENSUAL`: mismo día de mes; si no existe, último día del mes.
- Recurrentes: horizonte inicial de 12 ocurrencias.

No se agregó silenciosamente un job para extender ese horizonte.

## Almacenamiento de archivos

No se porta `ManttoLabBlobStore`/IndexedDB del LAB.

La implementación productiva reutiliza la infraestructura existente de Mantto Gestor:

- Azure Blob privado;
- `storage-contract.service.js` para carga y persistencia compensada;
- `storage-access.service.js` para SAS temporal autorizado;
- metadata del archivo en `entregas_instancias`;
- no se crea una tercera tabla de archivos.

## API

Se registran 11 rutas bajo `/api/entregas`:

1. `GET /api/entregas/opciones`
2. `GET /api/entregas/programadas`
3. `GET /api/entregas/programadas/:id`
4. `POST /api/entregas/programadas`
5. `DELETE /api/entregas/programadas/:id`
6. `GET /api/entregas/mis-entregas`
7. `POST /api/entregas/instancias/:id/archivo`
8. `GET /api/entregas/instancias/:id/archivo/acceso`
9. `GET /api/entregas/validacion`
10. `POST /api/entregas/instancias/:id/validar`
11. `GET /api/entregas/indicadores`

## Seguridad

- permisos funcionales validados en backend con el Guard General;
- agrupación de alcance `ENTREGAS`;
- permisos de pestañas/acciones también representados en frontend;
- solo el colaborador asignado puede cargar/reemplazar su archivo;
- solo el responsable puede desactivar y validar;
- el acceso al archivo se limita al responsable o colaborador de la instancia;
- frontend no se usa como frontera final de seguridad.

## Archivos de proyecto incluidos

### Nuevos

- `backend/src/modules/entregas-control/entregas-control.controller.js`
- `backend/src/modules/entregas-control/entregas-control.repository.js`
- `backend/src/modules/entregas-control/entregas-control.routes.js`
- `backend/src/modules/entregas-control/entregas-control.service.js`
- `modules/entregas-control/entregas-control.css`
- `modules/entregas-control/entregas-control.js`

### Modificados — incluidos completos

- `backend/src/routes/index.js`
- `core/app.js`
- `core/router.js`
- `index.html`

**No hay ningún `.patch` en esta entrega.**

## Aplicación

Los cuatro archivos globales completos fueron construidos contra el commit base indicado. Para evitar sobreescribir cambios posteriores, aplicar solo si el repositorio local continúa exactamente en esa base y está limpio.

Ejemplo de comprobación previa en PowerShell:

```powershell
$REPO="C:\Users\T14s\Downloads\mantto_gestor_frontend"
Set-Location $REPO

git rev-parse HEAD
git status --short
```

Debe mostrar:

```text
578913484440865e56044601b8e85ab62367f9c9
```

y `git status --short` debe estar vacío.

Después, copiar al repositorio **solo los 10 archivos de proyecto** de este paquete conservando exactamente sus rutas.

Validación posterior recomendada:

```powershell
node --check .\backend\src\modules\entregas-control\entregas-control.controller.js
node --check .\backend\src\modules\entregas-control\entregas-control.repository.js
node --check .\backend\src\modules\entregas-control\entregas-control.routes.js
node --check .\backend\src\modules\entregas-control\entregas-control.service.js
node --check .\modules\entregas-control\entregas-control.js
node --check .\backend\src\routes\index.js
node --check .\core\app.js
node --check .\core\router.js

git diff --check
git status --short
git diff --stat
```

Si `main` o el repositorio local ya cambió respecto al commit base, **no sobreescribir los archivos globales**: la Fase 1 debe rebasarse contra la versión vigente.

## Reversión antes de commit

Esta reversión solo es segura si Fase 1 se aplicó sobre el commit base limpio indicado arriba y aún no se mezclaron otros cambios locales:

```powershell
git restore -- .\backend\src\routes\index.js .\core\app.js .\core\router.js .\index.html
Remove-Item .\backend\src\modules\entregas-control -Recurse -Force
Remove-Item .\modules\entregas-control -Recurse -Force
```

Esto revierte **solo Fase 1 de código**; no revierte Fase 0 de BD.

## Validaciones realizadas al preparar el paquete

Consultar `VALIDACION_FASE_1_ENTREGAS_V001.txt`.

## No ejecutado

No se presenta como realizado:

- aplicación de Fase 0 en Aiven;
- prueba contra Aiven real;
- carga real a Azure Blob;
- E2E en navegador real;
- despliegue del backend en Azure;
- despliegue del frontend en Netlify;
- commit o push a GitHub.

Esas comprobaciones pertenecen al cierre/QA en el entorno correspondiente.
