# FASE 6 — COBRANZA COR · EDITAR / ELIMINAR V001

**Proyecto:** Gestor Mantto
**Fecha:** 2026-10-02
**Base oficial revisada:** GitHub `main` — `bb1294520882e02e12bf8d82cb5387ad244b16d9` — `Version 100226.3`

## Objetivo

Agregar a las tablas de **Facturas** y **Pagos** del detalle de Estado de Cuenta las acciones:

- Editar
- Eliminar

La edición ocurre **en la misma fila**, sin cambiar de pantalla, sin modal, sin drawer y sin ventana flotante.

La eliminación pide confirmación **en la misma fila**.

## Resultado

### Facturas

Se puede editar inline:

- Factura
- Tipo Hito/Aditiva
- Concepto
- Fecha factura
- Subtotal
- IVA
- Fecha vencimiento

Moneda y Total se mantienen derivados del concepto/importes. El estatus de Factura sigue derivándose de los Pagos aplicados y se recalcula si cambia el total.

Al eliminar una Factura se eliminan primero sus relaciones de `cobranza_rel_pagos` y después únicamente la Factura seleccionada, dentro de la misma transacción.

### Pagos

Se puede editar inline:

- Complemento Pago
- Fecha Pago
- Importe

ID Pago permanece de solo lectura y la relación Pago ↔ Factura continúa administrándose por el flujo ya existente de Fase 5.

Al eliminar un Pago se eliminan sus relaciones con Facturas, se elimina únicamente ese Pago y se recalcula el estatus de las Facturas afectadas en la misma transacción.

**Nota funcional:** `cobranza_pagos_cor` continúa sincronizándose desde Hoja SB por `id_pago_cor`. Si la fuente vuelve a enviar un Pago eliminado o campos editados manualmente, la sincronización posterior puede recrear/sobrescribir esos datos. Esta fase no cambia el contrato del sincronizador.

## Seguridad

- Reutiliza el permiso existente de Estados de Cuenta.
- Viewer continúa en solo lectura.
- Todas las mutaciones vuelven a validar que el PPNS esté dentro del alcance autorizado.
- Facturas se validan por `id_factura_cor + PPNS`.
- Pagos se validan dentro del Estado de Cuenta antes de modificar/eliminar.
- No se reintroduce rechazo de folios históricos duplicados.
- No cambia la regla actual: un Pago puede tener varias Facturas y una Factura no puede pertenecer a varios Pagos diferentes.

## Compatibilidad con fases anteriores

La Fase 6 **no reemplaza `backend/src/modules/cobranza-cor/cobranza-cor.routes.js`**. Sus cuatro rutas nuevas viven en un router separado montado desde `backend/src/routes/index.js`. Esto evita pisar rutas añadidas por otras fases del módulo Pagos.

`core/module-loader.js` conserva la ruta `cobranza-pagos` de Fase 3 y agrega únicamente los recursos de acciones inline al detalle de Estados de Cuenta.

## Estructura reutilizada

No se crean ni alteran tablas.

Se reutilizan:

```text
cobranza_facturas_cor
cobranza_pagos_cor
cobranza_rel_pagos
cobranza_fuente_cor
```

## Archivos de la entrega

```text
backend/src/routes/index.js
backend/src/modules/cobranza-cor/cobranza-cor-registros.routes.js
backend/src/modules/cobranza-cor/cobranza-cor-registros.controller.js
backend/src/modules/cobranza-cor/cobranza-cor-registros.service.js
backend/src/modules/cobranza-cor/cobranza-cor-registros.repository.js
core/module-loader.js
modules/cobranza-cor/cobranza-cor-estados-cuenta-acciones.js
modules/cobranza-cor/cobranza-cor-estados-cuenta-acciones.css
tests/cobranza-cor-registros-fase6.test.js
```

Solo se incluyen archivos modificados o nuevos de esta fase. Se entregan archivos completos, no fragmentos ni `.patch`.

## Validaciones realizadas

- `node --check` en todos los JS de la entrega: PASS.
- pruebas dirigidas Fase 6: 7/7 PASS.
- el `backend/src/routes/index.js` reconstruido sin las dos líneas Fase 6 coincide exactamente con el blob oficial `6bcbe34cd551c2df9841bca8a14d41e72d8b7b32` de `main`.
- `core/module-loader.js` fue reconstruido desde el blob oficial `ff1a0795aac096f3c5c37745b681e3293494198d` y conserva la integración acumulada de Fase 3.
- no contiene SQL, migraciones ni cambios de esquema.
- no contiene `window.confirm`, `<dialog>` ni navegación para editar.
- el router histórico `cobranza-cor.routes.js` queda intacto.

## No ejecutado

```text
Aiven real                 NO EJECUTADO
E2E desplegado             NO EJECUTADO
GitHub push                NO EJECUTADO
Azure deploy               NO EJECUTADO
Netlify deploy              NO EJECUTADO
```

## Siguiente fase

**Fase 7 — QA integral y cierre** del flujo Cobranza COR / Pagos / Facturas.
