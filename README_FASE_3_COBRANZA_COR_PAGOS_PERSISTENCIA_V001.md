# FASE 3 - COBRANZA COR / PAGOS - PERSISTENCIA V001

**Fecha:** 2026-10-01  
**Proyecto:** Mantto Gestor  
**Dominio:** CORELLIAN / Cobranza  
**Ruta:** `POST /api/cobranza-cor/carga/pagos`

## 1. Objetivo

Cerrar la persistencia de Pagos en `cobranza_pagos_cor` utilizando la definición aprobada por Joseph:

- `Hoja SB` columnas **A:U** = 21 campos canónicos de negocio.
- `Hoja SB` columna **V** = `id_pago`.
- `id_pago` es la identidad técnica y referencia de UPSERT.
- Backend mapea `id_pago` directamente a `cobranza_pagos_cor.id_pago_cor`.

No se crea una llave comercial alternativa y no se usa `no_factura`, `proyecto` ni `complemento_pago` como identidad de persistencia.

## 2. Base verificada

La estructura suministrada de `cobranza_pagos_cor` ya contiene:

```sql
id_pago_cor BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY
```

Por lo tanto **Fase 3 no requiere ALTER TABLE ni tabla nueva**. MySQL permite insertar un valor positivo explícito en una columna `AUTO_INCREMENT`; en esta integración el ID explícito proviene de `Hoja SB.V`.

`id_pp` permanece físicamente en la tabla por compatibilidad histórica, pero esta integración no lo inserta ni lo actualiza.

## 3. Contrato V002 de integración

Fase 3 introduce un cambio de contrato deliberado y explícito:

```text
version: COBRANZA_PAGOS_AIVEN_V002
key_fields: ["id_pago"]
```

Cada registro contiene:

```text
id_pago
+ 21 campos canónicos de Hoja SB
```

Los 21 campos canónicos siguen siendo:

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

`id_pago_cor` sigue siendo un nombre interno de BD y está prohibido en el payload. El emisor manda `id_pago`; el repositorio hace el mapeo.

## 4. Persistencia

Para cada lote de hasta 300 registros:

```text
validar contrato
  -> validar id_pago positivo y único dentro del lote
  -> normalizar los 21 campos
  -> abrir conexión
  -> BEGIN
  -> SELECT id_pago_cor ... FOR UPDATE
  -> por cada registro:
       ID inexistente -> INSERT con id_pago_cor = id_pago
       ID existente + datos distintos -> UPDATE
       ID existente + datos iguales -> UNCHANGED
  -> COMMIT
  -> HTTP 200
```

Si ocurre un error estructural de BD:

```text
ROLLBACK
HTTP 500
checkpoint del GAS NO avanza
```

El `UPDATE` utiliza comparación null-safe de MySQL (`<=>`) para no escribir cuando los 21 valores ya son iguales. Esto evita actualizar `updated_at` en un replay sin cambios.

## 5. Idempotencia

La idempotencia queda definida por:

```text
id_pago -> id_pago_cor
```

Reenviar el mismo lote con los mismos IDs y valores produce `sin_cambios` en vez de insertar duplicados.

Fase 3 **no elimina** registros que dejen de aparecer en `Hoja SB`.

## 6. Duplicados comerciales permitidos

Se conserva la regla acordada durante el filtrado:

```text
misma no_factura + mismo complemento_pago + datos distintos
```

puede producir más de un registro, siempre que cada fila tenga un `id_pago` diferente.

Ejemplo válido:

```text
id_pago=501 | CFV-2986 | Pago #CP13577 | -40000.00
id_pago=502 | CFV-2986 | Pago #CP13577 | -0.71
```

## 7. Archivos modificados / nuevos

### Repositorio Mantto Gestor

```text
backend/src/modules/cobranza-cor/cobranza-cor-pagos.service.js
backend/src/modules/cobranza-cor/cobranza-cor-pagos.repository.js
tests/cobranza-cor-pagos-fase3.test.js
```

`cobranza-cor.routes.js` y `cobranza-cor-pagos.controller.js` no cambian respecto de Fase 1.

### Google Apps Script externo al repositorio

```text
COBRANZA_PAGOS_SHEETS_AIVEN_V002.gs
```

Este archivo reemplaza al emisor V001. Ahora lee `Hoja SB`, exige `id_pago` en V, envía `key_fields=["id_pago"]` y usa `COBRANZA_PAGOS_AIVEN_V002`.

## 8. Orden de aplicación

Esta entrega es incremental:

```text
1. FASE 1 endpoint V001
2. FASE 2 normalización V002
3. FASE 3 persistencia V001  <- esta entrega
```

En backend, el `cobranza-cor-pagos.service.js` de Fase 3 **reemplaza** al de Fase 2 V002.

El nuevo `cobranza-cor-pagos.repository.js` debe ubicarse junto al service.

## 9. Regla crítica de estabilidad de `id_pago`

Fase 3 toma como decisión aprobada que **V es la identidad del pago**. En consecuencia, un mismo pago debe conservar el mismo `id_pago` en ejecuciones futuras.

Antes de E2E debe verificarse especialmente este punto:

> Si V se calcula únicamente con el número de fila (`ROW()-1`, por ejemplo) y el orden de `Hoja SB` puede cambiar cuando se reconstruye A:U, el mismo ID podría terminar asociado a otra fila. En ese escenario la identidad no sería estable.

Fase 3 no puede inferir desde backend si un ID fue reasignado legítima o accidentalmente; confía en `id_pago` porque fue definido como la referencia canónica.

Esta verificación queda como criterio obligatorio de Fase 4 antes de habilitar la carga real.

## 10. Sistemas que NO modifica esta entrega

La generación de este ZIP no ejecutó escrituras sobre:

```text
GitHub
Aiven
Azure
Netlify
Google Sheets
NetSuite
```

Tampoco modifica:

```text
cobranza_rel_pagos
cobranza_facturas_cor
```

No se generó migración SQL porque no se requiere cambio de esquema para usar el PK existente.

## 11. Validaciones locales ejecutadas

Ejecutadas sobre los archivos de esta entrega:

```text
node --check cobranza-cor-pagos.service.js          PASS
node --check cobranza-cor-pagos.repository.js       PASS
node --check cobranza-cor-pagos-fase3.test.js       PASS
node --check copia .js del GAS V002                 PASS
node --test tests/cobranza-cor-pagos-fase3.test.js  12/12 PASS
```

Cobertura local principal:

```text
id_pago obligatorio / positivo / entero seguro
id_pago duplicado dentro del lote rechazado
key_fields exclusivamente id_pago
id_pp e id_pago_cor prohibidos en payload
misma factura + mismo CP permitidos con IDs distintos
normalización DECIMAL / DATE / DATETIME conservada
INSERT por ID nuevo
UPDATE por ID existente con cambios
UNCHANGED por ID existente sin cambios
COMMIT en éxito
ROLLBACK en error
repositorio inserta id_pago en id_pago_cor
repositorio no escribe id_pp
```

## 12. Validaciones NO ejecutadas

No se debe presentar como validado lo siguiente:

```text
npm run check del repositorio completo        NO EJECUTADO
npm test completo del repositorio             NO EJECUTADO
prueba contra Aiven real                      NO EJECUTADA
despliegue Azure                              NO EJECUTADO
prueba HMAC contra Azure real                 NO EJECUTADA
E2E Hoja SB -> GAS -> Azure -> Aiven          NO EJECUTADO
estabilidad real de id_pago V entre refreshes NO CONFIRMADA
```

## 13. Fase 4

Sí: **Fase 4 será QA / pruebas y cierre de la integración de Pagos**.

Debe cubrir como mínimo:

```text
diagnóstico de Hoja SB V/id_pago
estabilidad de IDs entre reconstrucciones
IDs duplicados / vacíos / inválidos
HMAC válido e inválido
INSERT real controlado
replay -> UNCHANGED
cambio de un campo -> UPDATE del mismo id_pago
mismo A+T con IDs diferentes -> conserva ambas filas
rollback ante error
checkpoint/reanudación
lotes > 300
no escritura en cobranza_rel_pagos
no regresión de Estado de Cuenta
E2E controlado
```
