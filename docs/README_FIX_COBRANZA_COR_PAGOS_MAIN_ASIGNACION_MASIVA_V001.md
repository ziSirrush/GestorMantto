# FIX — Cobranza COR · Pagos · Main + Asignación Masiva V001

**Fecha:** 2026-10-02  
**Base revisada:** `ziSirrush/GestorMantto` · `main` · `8addea56c10a85f417e9aab2f941e6412c1077af`

## Alcance

Este FIX aplica los cambios solicitados al módulo **Cobranza > Pagos**:

1. desaparece el detalle individual del Pago;
2. toda la relación Pago → Proyecto se realiza desde la tabla principal;
3. cada fila tiene un list de proyecto;
4. el list se alimenta de `cobranza_fuente_cor`;
5. los proyectos se agrupan por `id_proyecto_origen` / PPNS;
6. permite asignación individual;
7. permite asignación masiva de hasta 100 Pagos seleccionados al mismo proyecto;
8. la asignación masiva es transaccional: si un Pago entra en conflicto con Facturas de otro proyecto, no se aplica parcialmente;
9. el Visor de usuarios permanece en solo lectura.

## Archivos modificados

```text
core/module-loader.js
modules/cobranza-cor/cobranza-cor-pagos.js
modules/cobranza-cor/cobranza-cor-pagos.css
backend/src/modules/cobranza-cor/cobranza-cor-pagos-modulo.repository.js
backend/src/modules/cobranza-cor/cobranza-cor-pagos-modulo.service.js
backend/src/modules/cobranza-cor/cobranza-cor-pagos-modulo.controller.js
backend/src/modules/cobranza-cor/cobranza-cor.routes.js
```

Archivo de pruebas nuevo:

```text
tests/cobranza-cor-pagos-main-asignacion-masiva.test.js
```

## Estructura existente reutilizada

No se crea ni modifica esquema.

Se reutiliza:

```text
cobranza_pagos_cor.id_pp       Pago → Proyecto
cobranza_fuente_cor            catálogo agrupado de proyectos
cobranza_rel_pagos             validación de relaciones Pago → Factura
```

## Comportamiento de la asignación masiva

- selección por checkbox;
- “Seleccionar página”;
- un solo proyecto destino por operación;
- máximo 100 Pagos por operación;
- si cualquier Pago tiene Facturas relacionadas con otro PPNS, se cancela toda la operación;
- no se realizan asignaciones parciales silenciosas.

## Validaciones ejecutadas

```text
node --check archivos JS modificados              PASS
pruebas dirigidas                                 7/7 PASS
Detalle GET /pagos/:idPagoCor                     eliminado
Fuente de proyectos                               cobranza_fuente_cor
Agrupación de proyectos                           id_proyecto_origen
CREATE/ALTER/DROP/TRUNCATE                         0
SQL                                                0
.patch                                             0
```

No se hizo push ni deploy y no se escribió directamente en Aiven.
