# FASE 5 — COBRANZA COR · PAGO → FACTURA V001

**Proyecto:** Gestor Mantto  
**Fecha:** 2026-10-02  
**Base revisada:** GitHub `main` — `bb1294520882e02e12bf8d82cb5387ad244b16d9` — `Version 100226.3`

## Resultado

La Fase 5 **ya está implementada en el `main` vigente**. Conforme a las normas del Gestor, no se genera código duplicado ni se sobrescriben archivos que ya cumplen el alcance.

Por lo tanto esta entrega es de **validación / reconciliación** y no contiene archivos de código para aplicar.

## Alcance validado en `main`

- En el detalle del Estado de Cuenta se muestran los Pagos disponibles del proyecto.
- Un Pago puede relacionarse con varias Facturas.
- Una Factura solo puede estar asignada a un Pago a la vez.
- Las Facturas ya asignadas dejan de aparecer en el selector de otras asignaciones.
- La relación permite indicar el importe aplicado.
- La suma aplicada no puede superar el importe del Pago.
- Se puede actualizar el importe aplicado o quitar la relación.
- El backend valida que Pago y Factura pertenezcan al mismo Estado de Cuenta.
- El estatus de la Factura se sincroniza desde los importes aplicados.
- La mutación trabaja con transacción y rollback ante error.
- Viewer permanece en solo lectura.
- Tras una mutación se invalida y recarga selectivamente el detalle afectado.
- Se reutiliza `cobranza_rel_pagos`; no se crea ni altera esquema.

## Archivos de `main` que ya contienen la Fase 5

```text
backend/src/modules/cobranza-cor/cobranza-cor-pagos.repository.js
backend/src/modules/cobranza-cor/cobranza-cor.service.js
backend/src/modules/cobranza-cor/cobranza-cor.controller.js
backend/src/modules/cobranza-cor/cobranza-cor.routes.js
modules/cobranza-cor/cobranza-cor-estados-cuenta.js
modules/cobranza-cor/cobranza-cor-estados-cuenta.css
tests/cobranza-cor-estados-cuenta-pagos-detalle.test.js
```

## Regla de entrega aplicada

No se incluyen copias de archivos sin cambios. Hacerlo contrariaría la regla del proyecto de entregar únicamente los archivos realmente modificados y podría pisar cambios más recientes.

## Sistemas modificados durante esta generación

Ninguno.

No se escribió en GitHub, Aiven, Azure ni Netlify.
