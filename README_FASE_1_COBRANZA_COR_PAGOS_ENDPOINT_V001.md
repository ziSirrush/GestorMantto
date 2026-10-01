# FASE 1 - Cobranza COR / Pagos - Endpoint y contrato V001

Fecha: 2026-10-01
Proyecto: Mantto Gestor
Base revisada: GitHub `ziSirrush/GestorMantto`, rama `main`
Commit base verificado: `95b93d063e228c2e1ada87926d9a7ad63d744556` (`Version 093026.6`)

## Objetivo

Agregar el contrato backend para el GAS `COBRANZA_PAGOS_SHEETS_AIVEN_V001.gs` sin habilitar todavia escrituras en Aiven.

Endpoint incorporado:

```text
POST /api/cobranza-cor/carga/pagos
```

La ruta reutiliza la autenticacion M2M ya existente de Ventas/Corellian:

```text
INTEGRATION_VENTAS_ID=ventas-appscript
INTEGRATION_VENTAS_SECRET=<secreto vigente>
```

No se agrega una identidad M2M nueva y no se modifica `.env.example`.

## Alcance de Fase 1

Esta fase:

- agrega la ruta `/carga/pagos` dentro del modulo existente `cobranza-cor`;
- reutiliza `requireCobranzaCorIntegration` y, por lo tanto, el guard M2M existente;
- valida el envelope generado por el GAS de `PagosNs`;
- valida metadata de snapshot y lotes de hasta 300 registros;
- valida consistencia entre `batch` y `registros.length`;
- rechaza campos tecnicos que no deben ser escritos por la integracion;
- conserva `key_fields` solo como metadata declarada por el GAS;
- NO usa `key_fields` todavia como identidad de UPSERT;
- NO normaliza todavia los 22 campos de negocio;
- NO hace INSERT/UPDATE en `cobranza_pagos_cor`;
- NO lee ni modifica `cobranza_rel_pagos`.

## Fail-closed intencional

Un payload valido termina deliberadamente con:

```text
HTTP 501
code = COBRANZA_PAGOS_PERSISTENCIA_PENDIENTE
```

Esto es intencional. El GAS avanza su checkpoint solamente ante respuestas 2xx. Mientras Fase 3 no implemente persistencia real, el backend no debe declarar falsamente que un lote fue guardado en Aiven.

Resultados esperados en Fase 1:

```text
HMAC/identidad incorrecta -> 401 segun middleware existente
Contrato invalido         -> 400
Contrato valido           -> 501 PERSISTENCIA_PENDIENTE
Aiven                      -> sin escrituras
cobranza_rel_pagos         -> sin cambios
```

## Contrato recibido desde GAS

```json
{
  "source": "google_sheets_bg_pagos",
  "version": "COBRANZA_PAGOS_AIVEN_V001",
  "sync_mode": "upsert",
  "key_fields": ["no_factura", "proyecto"],
  "snapshot_id": "<sha256 64 hex>",
  "batch": {
    "index": 1,
    "total": 1,
    "offset": 0,
    "count": 1,
    "total_records": 1,
    "is_last": true
  },
  "registros": [
    {
      "no_factura": "...",
      "proyecto": "..."
    }
  ]
}
```

`key_fields` sigue siendo provisional. La llave idempotente definitiva debe cerrarse con evidencia de `COBRANZA_PAGOS_DiagnosticoClaves`, antes de implementar el UPSERT de Fase 3.

## Archivos incluidos

```text
backend/src/modules/cobranza-cor/cobranza-cor.routes.js
backend/src/modules/cobranza-cor/cobranza-cor-pagos.controller.js
backend/src/modules/cobranza-cor/cobranza-cor-pagos.service.js
README_FASE_1_COBRANZA_COR_PAGOS_ENDPOINT_V001.md
```

### Archivo existente modificado

```text
backend/src/modules/cobranza-cor/cobranza-cor.routes.js
```

Cambio localizado:

- importa `cobranza-cor-pagos.controller.js`;
- registra `POST /carga/pagos` con `requireCobranzaCorIntegration`.

### Archivos nuevos

```text
backend/src/modules/cobranza-cor/cobranza-cor-pagos.controller.js
backend/src/modules/cobranza-cor/cobranza-cor-pagos.service.js
```

Se aisla Pagos en archivos propios para no modificar innecesariamente el controller/service historico de Cobranza COR.

## Instalacion

Copiar el contenido del ZIP sobre la raiz del repositorio Mantto Gestor conservando la estructura de carpetas.

Antes de commit/deploy revisar:

```powershell
git status
git diff -- backend/src/modules/cobranza-cor/cobranza-cor.routes.js
git diff --no-index NUL backend/src/modules/cobranza-cor/cobranza-cor-pagos.controller.js
git diff --no-index NUL backend/src/modules/cobranza-cor/cobranza-cor-pagos.service.js
```

No ejecutar `COBRANZA_PAGOS_EnviarAiven` esperando una sincronizacion exitosa mientras el backend permanezca en Fase 1. La respuesta 501 es la proteccion prevista.

## Validaciones realizadas sobre este entregable

Realizadas localmente sobre los archivos del FIX:

```text
node --check cobranza-cor.routes.js                    PASS
node --check cobranza-cor-pagos.controller.js          PASS
node --check cobranza-cor-pagos.service.js             PASS
Contrato vacio -> HTTP lógico 400 / CONTRATO_INVALIDO  PASS
Contrato valido -> 501 / PERSISTENCIA_PENDIENTE        PASS
Campo tecnico id_pago_cor -> rechazo 400               PASS
```

No se realizo:

```text
npm run check del repositorio completo   NO EJECUTADO
npm test del repositorio completo        NO EJECUTADO
prueba contra Aiven                      NO EJECUTADA
prueba HTTP desplegada en Azure          NO EJECUTADA
despliegue Azure                         NO EJECUTADO
commit/push GitHub                        NO EJECUTADO
E2E Sheets -> Azure -> Aiven              NO EJECUTADO
```

## Sistemas modificados por la preparacion de este FIX

```text
GitHub        INTACTO
Aiven         INTACTO
Azure         INTACTO
Netlify       INTACTO
Google Sheets INTACTO
```

Este ZIP es un entregable preparado; no fue aplicado ni desplegado.

## Siguiente fase

Fase 2 debe implementar validacion y normalizacion de los 22 campos de PagosNs sin persistencia ambigua. La llave real de idempotencia debe decidirse con el resultado del diagnostico de claves antes de habilitar el UPSERT.
