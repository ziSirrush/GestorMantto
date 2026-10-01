# FASE 2 - Cobranza COR / Pagos - Validacion y normalizacion V002

Fecha: 2026-10-01
Proyecto: Mantto Gestor
Base oficial revisada: GitHub `ziSirrush/GestorMantto`, rama `main`
Commit `main` verificado al regenerar este entregable: `95b93d063e228c2e1ada87926d9a7ad63d744556` (`Version 093026.6`)

## Estado de esta entrega

Esta V002 **reemplaza por completo** la entrega anterior:

```text
FASE_2_COBRANZA_COR_PAGOS_NORMALIZACION_V001
```

No deben aplicarse ambas. Para continuar, usar Fase 1 y despues esta V002.

## Prerrequisito

Esta Fase 2 sigue siendo incremental sobre:

```text
FASE_1_COBRANZA_COR_PAGOS_ENDPOINT_V001
```

GitHub `main` verificado todavia no contiene los archivos nuevos de Fase 1. Por lo tanto:

1. aplicar primero Fase 1;
2. aplicar despues este ZIP de Fase 2 V002;
3. no aplicar Fase 2 directamente sobre `main` limpio esperando que cree ruta/controller de Fase 1.

## Cambio funcional respecto a V001

La fuente canonica que llegara al backend ya no es el registro bruto de 22 columnas de `PagosNs`.
El flujo aprobado ahora es:

```text
PagosNs (22 columnas de origen)
        |
        v
Filtro GAS PagosNs -> Hoja SB
        |
        v
Hoja SB (21 campos canonicos)
        |
        v
POST /api/cobranza-cor/carga/pagos
```

`ID PP` fue retirado del contrato canonico de envio.

La tabla `cobranza_pagos_cor` conserva actualmente la columna nullable `id_pp`, pero Fase 2 V002 no la recibe ni la normaliza. No se requiere ALTER TABLE para esta fase.

## Contrato canonico de 21 campos

```text
no_factura
cliente
limite_credito
proyecto
fecha_servicio
estado
facturado
pagado
saldo
dias_retraso
fecha_emision
fecha_vencimiento
terminos
zona_adm
subsidiaria
clase
creado_desde
fecha_creacion_ov
complemento_pago
fecha_complemento_pago
importe_complemento_pago
```

Un payload que todavia envie `id_pp` es rechazado como campo no reconocido. Esto evita aceptar silenciosamente un emisor antiguo de 22 campos.

## Duplicados y agrupacion A + T

El filtro de Google Sheets usa como agrupador:

```text
No. Factura + Complemento de pago
```

pero esa combinacion **NO se declara unica en backend**.

La evidencia revisada mostro casos donde una misma combinacion puede tener mas de una fila valida porque cambia, por ejemplo, `importe_complemento_pago`.

Por ello Fase 2 V002 permite, por ejemplo:

```text
CFV-2986 | Pago #CP13577 | -40000.00
CFV-2986 | Pago #CP13577 | -0.71
```

como dos registros distintos del mismo lote.

La consolidacion de filas totalmente identicas ocurre antes, en el filtro `PagosNs -> Hoja SB`; el backend no inventa una llave unica a partir de A+T.

## Alcance de Fase 2 V002

Esta fase:

- conserva el endpoint y autenticacion de Fase 1;
- valida exactamente 21 campos canonicos;
- elimina `id_pp` del contrato de entrada;
- rechaza campos desconocidos y campos tecnicos de BD;
- exige `no_factura` porque `cobranza_pagos_cor.no_factura` es NOT NULL;
- convierte vacios opcionales a NULL;
- valida longitudes varchar sin truncar;
- valida DECIMAL(18,2), INT, DATE y DATETIME;
- permite valores negativos cuando el esquema no los prohibe;
- permite varias filas con misma factura;
- permite varias filas con misma factura + mismo complemento cuando sus datos difieren;
- no considera `no_factura + proyecto` una llave unica;
- no considera `no_factura + complemento_pago` una llave unica;
- no escribe Aiven;
- no toca `cobranza_rel_pagos`;
- mantiene fail-closed HTTP 501 hasta Fase 3.

## Endpoint y contrato tecnico conservados

```text
POST /api/cobranza-cor/carga/pagos
```

Se conservan por compatibilidad con Fase 1:

```text
source  = google_sheets_bg_pagos
version = COBRANZA_PAGOS_AIVEN_V001
sync_mode = upsert
```

El nombre de version del protocolo no se incremento en esta fase para no modificar Fase 1 ni el envelope tecnico antes de la actualizacion del GAS emisor.

`key_fields` continua siendo metadata del envelope. No se usa para decidir UPSERT:

```text
key_fields_usados_para_upsert = false
identidad_upsert = PENDIENTE_DEFINICION
```

## Fail-closed

Un payload correcto de 21 campos sigue terminando deliberadamente con:

```text
HTTP 501
code = COBRANZA_PAGOS_PERSISTENCIA_PENDIENTE
```

El detalle confirma:

```text
fase = 2
contrato_valido = true
normalizacion_valida = true
campos_normalizados = 21
key_fields_usados_para_upsert = false
identidad_upsert = PENDIENTE_DEFINICION
escribe_cobranza_pagos_cor = false
escribe_cobranza_rel_pagos = false
```

## Archivos incluidos

```text
backend/src/modules/cobranza-cor/cobranza-cor-pagos.service.js
tests/cobranza-cor-pagos-fase2.test.js
README_FASE_2_COBRANZA_COR_PAGOS_NORMALIZACION_V002.md
```

Solo se incluyen archivos modificados respecto de Fase 1 / Fase 2 anterior.

## Archivos no modificados

```text
backend/src/modules/cobranza-cor/cobranza-cor.routes.js
backend/src/modules/cobranza-cor/cobranza-cor-pagos.controller.js
backend/src/modules/cobranza-cor/cobranza-cor.repository.js
backend/src/modules/cobranza-cor/cobranza-cor.service.js
backend/.env.example
```

## Base de datos

No requiere:

```text
ALTER TABLE
CREATE TABLE
CREATE INDEX
INSERT
UPDATE
DELETE
```

No se modifica:

```text
cobranza_pagos_cor
cobranza_facturas_cor
cobranza_rel_pagos
```

La columna `cobranza_pagos_cor.id_pp` queda intacta y, al ser nullable segun el dump revisado, puede permanecer NULL cuando en Fase 3 se implemente la persistencia.

## Dependencia externa pendiente antes de E2E

El archivo emisor anterior `COBRANZA_PAGOS_SHEETS_AIVEN_V001.gs` aun fue generado para leer directamente `PagosNs` con 22 campos.

Por lo tanto, antes de la prueba E2E debe actualizarse el emisor para leer la `Hoja SB` de 21 campos y dejar de enviar `id_pp`.

Esta entrega no modifica ese GAS porque el alcance solicitado es Fase 2 backend.

## Validaciones locales de esta V002

Se ejecutaron:

```text
node --check backend/src/modules/cobranza-cor/cobranza-cor-pagos.service.js
node --check tests/cobranza-cor-pagos-fase2.test.js
node --test tests/cobranza-cor-pagos-fase2.test.js
git diff --no-index --check Fase2 V001 -> Fase2 V002 service
```

Cobertura especifica:

```text
21 campos exactos                                      PASS
id_pp fuera del contrato                               PASS
registro canonico 21 campos                            PASS
vacios opcionales -> NULL                              PASS
no_factura obligatorio                                 PASS
campos faltantes/desconocidos/tecnicos                 PASS
longitudes varchar                                     PASS
DECIMAL(18,2)                                          PASS
INT dias_retraso                                       PASS
DATE / DATETIME                                        PASS
misma factura + proyecto permitidos                    PASS
misma factura + mismo complemento con diferencias      PASS
contrato valido -> 501 fail-closed                     PASS
```

No se ejecutaron pruebas contra Aiven, Azure ni E2E. No se realizo commit/push/deploy.

## Sistemas modificados al preparar esta entrega

```text
GitHub        INTACTO
Aiven         INTACTO
Azure         INTACTO
Netlify       INTACTO
Google Sheets INTACTO
```

## Siguiente paso

Antes de Fase 3 deben quedar cerrados:

1. GAS emisor `Hoja SB -> Azure` con los 21 campos canonicos;
2. identidad idempotente real de persistencia. A+T sirve para agrupar en el filtro, pero no es una llave unica porque se conservaron filas no identicas bajo la misma A+T.

Hasta entonces, Fase 2 debe continuar fallando cerrado con HTTP 501.
