# FASE 2 — ENTREGAS V001 · QA, integración y cierre

## Estado de este paquete

**PREPARADO / NO CERRADO EN INFRAESTRUCTURA REAL.**

Fase 2 es la fase de validación final de la agrupación `Entregas`. No introduce una tercera tabla ni una nueva fuente de archivos. Tampoco agrega funcionalidad distinta a INT-7.

Este paquete **no modifica código productivo** porque la revisión local de Fase 1 no detectó una corrección de implementación que justifique tocar archivos del Gestor. Por ello no existe `APLICAR_FIX` ni `ROLLBACK_FIX` en Fase 2: inventarlos implicaría simular un cambio que no existe.

## Prerrequisitos

1. `FASE_0_ENTREGAS_V001` aplicada y validada en la BD objetivo.
2. `FIX_FASE_1_ENTREGAS_V001` aplicado al código que se va a probar.
3. Para smoke API: token de una identidad autorizada. Fase 0 concede los permisos completos al rol 1; otros roles requieren su configuración real en Panel de Control.
4. Para E2E: entorno de Pruebas con Aiven y Azure Blob configurados.

## Base revisada al preparar Fase 2

- Repositorio oficial: `ziSirrush/GestorMantto`
- `main` verificado: `578913484440865e56044601b8e85ab62367f9c9`
- Commit: `Version 100726.1`
- Fecha: 07/10/2026

Fase 1 es incremental sobre esa base y todavía no se afirma como desplegada en `main`.

## Qué contiene

- `EJECUTAR_FASE_2_ENTREGAS_V001.ps1`
  - orquestador de validación local y, opcionalmente, smoke API de lectura.
- `VALIDAR_LOCAL_FASE_2_ENTREGAS_V001.ps1`
  - verifica archivos, sintaxis, integración global, permisos, 11 rutas, recurrencias, autorización y contrato Azure mediante mocks sin tocar infraestructura.
- `tools/entregas-fase2-contract.cjs`
  - arnés portable de pruebas contra los archivos reales del repo donde Fase 1 esté aplicada.
- `VALIDAR_AIVEN_FASE_2_ENTREGAS_V001.sql`
  - smoke **solo lectura** de las dos tablas, columnas, índices/FKs, 10 permisos, rol 1 y consistencia de datos.
- `VALIDAR_API_LECTURA_FASE_2_ENTREGAS_V001.ps1`
  - prueba únicamente GETs protegidos; no crea, elimina, valida ni carga archivos.
- `CHECKLIST_E2E_AZURE_FASE_2_ENTREGAS_V001.md`
  - flujo real controlado: creación, Azure Blob, SAS, rechazo, reemplazo, validación, seguridad y responsive.
- `RESULTADO_CIERRE_FASE_2_ENTREGAS_V001.md`
  - acta de resultados. Nace en PENDIENTE; no se marca PASS sin evidencia.
- `VALIDACION_PREPARACION_FASE_2_ENTREGAS_V001.txt`
  - pruebas que sí se ejecutaron durante la generación de este paquete.
- `MANIFEST_FASE_2_ENTREGAS_V001.txt`
- `CHECKSUMS_FASE_2_ENTREGAS_V001_SHA256.txt`

## Ejecución rápida

```powershell
$REPO="C:\Users\T14s\Downloads\mantto_gestor_frontend"
$FASE2="$env:USERPROFILE\Downloads\FASE_2_ENTREGAS_V001"

Set-Location $FASE2
.\EJECUTAR_FASE_2_ENTREGAS_V001.ps1 -Repo $REPO
```

Con smoke API de lectura:

```powershell
.\EJECUTAR_FASE_2_ENTREGAS_V001.ps1 `
  -Repo $REPO `
  -ApiBase "https://<backend-autorizado>" `
  -Token "<JWT_DE_PRUEBA>"
```

El token solo se usa en memoria por PowerShell y el script no lo imprime.

## Validaciones ejecutadas al preparar el paquete

PASS locales sobre los archivos de Fase 1:

- `node --check` de los JS del módulo;
- contrato de las 11 rutas y guards `GENERAL / ENTREGAS`;
- upload `archivo`, 1 archivo, política `GENERAL`;
- semanal +7, quincenal +15, mensual con fin de mes y bisiesto;
- estados A tiempo/Tarde/No entregado/Pendiente;
- alta transaccional con 12 ocurrencias;
- rechazo de detalle por no-responsable;
- rechazo de carga por no-colaborador;
- flujo simulado Azure upload → persistencia → limpieza anterior;
- SAS únicamente para responsable/colaborador;
- validación únicamente por responsable;
- compatibilidad de columnas/permisos de Fase 1 contra el SQL de Fase 0;
- sin `ManttoLabBlobStore`, IndexedDB, Supabase o Railway nuevos.

## No ejecutado y no afirmado

No puedo confirmar todavía como PASS:

- Fase 0 realmente aplicada en tu Aiven actual;
- Fase 1 realmente aplicada/desplegada;
- endpoints `/api/entregas/*` contra backend desplegado;
- carga real a Azure Blob;
- emisión real de SAS;
- E2E en navegador;
- responsive visual real;
- regresión real post-deploy;
- commit/push/deploy de esta integración.

## Criterio final

La agrupación `Entregas` queda **sin fases de desarrollo adicionales planificadas** después de Fase 2, pero **Fase 2 no se considera cerrada hasta ejecutar las validaciones reales** del checklist.

Si aparece un fallo, la salida correcta no es crear una “Fase 3” automáticamente: se genera un **FIX incremental de Fase 2** únicamente para la causa comprobada y se repite QA.
