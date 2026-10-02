# FASE 3 — COBRANZA COR · PAGOS · FRONTEND V001

**Proyecto:** Gestor Mantto  
**Agrupación:** Cobranza CORELLIAN  
**Módulo:** Pagos  
**Fecha:** 2026-10-02  
**Base GitHub revisada:** `bb1294520882e02e12bf8d82cb5387ad244b16d9` — `Version 100226.3`

## Objetivo

Integrar la interfaz de lectura del nuevo módulo **Cobranza > Pagos**, consumiendo exclusivamente los endpoints creados en Fase 2.

Esta fase requiere que se hayan aplicado antes:

1. Fase 1 — permiso, panel lateral y ruta `cobranza-pagos`.
2. Fase 2 — backend GET de listado y detalle de Pagos.

## Alcance de esta entrega

- listado real de Pagos;
- buscador;
- filtros por Estado y Zona Adm.;
- paginación;
- selector de 25 / 50 / 100 registros;
- actualización manual;
- detalle del Pago dentro del mismo módulo;
- diseño responsive;
- carga lazy por `core/module-loader.js`;
- manejo de acceso denegado sin exponer datos.

## No incluye

- relación Pago → Proyecto;
- relación Pago → Factura;
- edición o eliminación de Pagos;
- cambios de esquema;
- tablas nuevas;
- SQL;
- POST, PUT, PATCH o DELETE.

## Archivos modificados / nuevos

```text
core/module-loader.js
modules/cobranza-cor/cobranza-cor-pagos.js
modules/cobranza-cor/cobranza-cor-pagos.css
tests/cobranza-cor-pagos-modulo-fase3.test.js
```

Se entregan archivos completos. No se incluye `.patch`.

## Validación realizada

- `core/module-loader.js` base reconstruido y verificado contra el blob GitHub oficial `ff1a0795aac096f3c5c37745b681e3293494198d` antes de modificarlo.
- `node --check` de JS: PASS.
- pruebas dirigidas Fase 3: 6/6 PASS.
- pruebas Fase 2 usadas como contrato previo: 7/7 PASS.
- referencias de mutación HTTP en frontend Fase 3: 0.
- referencias a `cobranza_rel_pagos` en frontend Fase 3: 0.
- archivos SQL: 0.
- archivos `.patch`: 0.

## Estado de validación

Validado de forma estática y unitaria en entorno local de entrega.

**No se ejecutó:**

- escritura en Aiven;
- prueba E2E contra backend desplegado;
- deploy Azure/Netlify;
- push GitHub.

## Próxima fase

**Fase 4:** relación manual Pago → Proyecto usando únicamente la estructura existente aprobada del Gestor.
