# FASE 2 - COBRANZA COR / PAGOS - LECTURA BACKEND V001

**Fecha:** 2026-10-02
**Proyecto:** Mantto Gestor
**Dominio:** CORELLIAN / Cobranza
**Base GitHub revisada:** `bb1294520882e02e12bf8d82cb5387ad244b16d9` (`Version 100226.3`)
**Dependencia funcional:** Fase 1 del modulo Pagos aplicada previamente.

## 1. Objetivo

Implementar la **lectura backend** del nuevo modulo **Cobranza > Pagos** usando exclusivamente la tabla existente `cobranza_pagos_cor`.

Esta fase convierte la ruta registrada en Fase 1 en un contrato backend consultable, pero **todavia no integra el frontend funcional del modulo, no relaciona Pago -> PPNS y no modifica Pagos**.

## 2. Alcance exacto

Se agregan dos endpoints humanos de solo lectura:

```text
GET /api/cobranza-cor/pagos
GET /api/cobranza-cor/pagos/:idPagoCor
```

Ambos utilizan:

```text
COBRANZA_PAGOS_ACCESO_VISUAL_MODULO.ACCESO_VISUAL
CORELLIAN
agrupacion COBRANZA
Guard General existente
```

### Restriccion temporal de alcance

La relacion **Pago -> PPNS** aun no forma parte de Fase 2.

Por esa razon, un Pago todavia no dispone de una llave de alcance por proyecto que permita filtrar de forma segura a usuarios CORELLIAN con alcance parcial. Para cumplir la norma **fail closed**, la lectura del universo crudo de Pagos exige temporalmente:

```text
acceso_dominio_completo = true
DOMINIO = CORELLIAN
```

Los usuarios con alcance parcial reciben `403 COBRANZA_PAGOS_SCOPE_COMPLETO_REQUERIDO` hasta que una fase posterior resuelva Pago -> PPNS y pueda aplicar el alcance por registro.

El Visor de Usuarios puede utilizar estos GET bajo sus reglas normales de solo lectura; esta fase no incorpora ninguna mutacion humana.

## 3. Datos expuestos

La respuesta conserva los 21 campos canonicos ya existentes en `cobranza_pagos_cor`, mas el identificador tecnico `id_pago_cor`:

```text
id_pago_cor
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

`id_pp` no se expone ni se usa como relacion funcional en esta fase. No se asume que ese campo sea una vinculacion PPNS valida.

## 4. Listado

`GET /api/cobranza-cor/pagos` acepta:

```text
q
estado
zona_adm
page
page_size
```

Reglas:

```text
page >= 1
1 <= page_size <= 100
page_size default = 50
orden = id_pago_cor DESC
```

`q` busca de forma parametrizada en:

```text
no_factura
cliente
proyecto
complemento_pago
creado_desde
```

La paginacion se ejecuta en SQL (`COUNT`, `LIMIT`, `OFFSET`), no en frontend.

## 5. Detalle

`GET /api/cobranza-cor/pagos/:idPagoCor`:

- exige `idPagoCor` entero positivo;
- devuelve exactamente un Pago;
- responde `404 COBRANZA_PAGO_NO_ENCONTRADO` si no existe;
- no devuelve Facturas relacionadas ni PPNS porque esas relaciones quedan fuera de Fase 2.

## 6. Archivos

```text
backend/src/modules/cobranza-cor/cobranza-cor.routes.js
backend/src/modules/cobranza-cor/cobranza-cor-pagos-modulo.controller.js
backend/src/modules/cobranza-cor/cobranza-cor-pagos-modulo.service.js
backend/src/modules/cobranza-cor/cobranza-cor-pagos-modulo.repository.js
tests/cobranza-cor-pagos-modulo-fase2.test.js
```

La entrega contiene archivos completos. No contiene `.patch`.

## 7. Lo que NO hace Fase 2

No realiza:

```text
CREATE TABLE
ALTER TABLE
DROP TABLE
TRUNCATE
INSERT/UPDATE/DELETE de Pagos
backfill
Pago -> PPNS
Pago -> Factura
cambios en cobranza_rel_pagos
cambios en cobranza_facturas_cor
cambios en cobranza_fuente_cor
frontend funcional de cobranza-pagos
asignaciones de permisos a roles/usuarios
deploy
push
```

Tampoco modifica la carga M2M existente `POST /api/cobranza-cor/carga/pagos`.

## 8. Aplicacion

Copiar los archivos conservando exactamente las rutas incluidas en el ZIP sobre una copia que ya tenga aplicada Fase 1.

No ejecutar SQL: **Fase 2 no contiene cambios de esquema ni datos**.

## 9. Validacion esperada despues de integrar en el repositorio completo

Desde la raiz del proyecto:

```powershell
node --check backend/src/modules/cobranza-cor/cobranza-cor.routes.js
node --check backend/src/modules/cobranza-cor/cobranza-cor-pagos-modulo.controller.js
node --check backend/src/modules/cobranza-cor/cobranza-cor-pagos-modulo.service.js
node --check backend/src/modules/cobranza-cor/cobranza-cor-pagos-modulo.repository.js
node --test tests/cobranza-cor-pagos-modulo-fase2.test.js
```

Ademas, ejecutar la bateria normal del backend antes de despliegue.

## 10. Estado de validacion de esta entrega

Se realizaron validaciones estaticas y pruebas unitarias aisladas sobre los archivos de la entrega.

No se ejecutaron:

```text
consultas contra Aiven real
prueba contra Azure
GitHub Pages
Netlify
E2E con sesion real
push/commit/deploy
```

Por tanto, esta entrega debe describirse como **generada y validada localmente de forma estatica/unitaria**, no como desplegada ni validada contra Produccion.
