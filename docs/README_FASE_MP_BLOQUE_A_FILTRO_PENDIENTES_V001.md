# FASE MP — BLOQUE A — Filtro de Pendientes V001

**Proyecto:** Mantto Gestor  
**Fecha:** 17/08/2026  
**Base:** `ziSirrush/GestorMantto` → `main`  
**Archivo base verificado:** `modules/cobranza-uni/cobranza-uni.js`  
**Git blob SHA base:** `a6e30aebebb231e4f5a70bcf16834b306f4096c3`

## Alcance

Se agrega en **Cobranza United → Mantenimiento Preventivo** un único filtro tipo lista para los pendientes, sin modificar backend, base de datos, consultas Aiven ni KPIs.

Opciones:

- `Todos`
- `Con Pendiente`
- `Facturas Pendientes`

## Reglas reutilizadas

El filtro usa los mismos campos y criterio que ya utiliza la pantalla/KPI de Mantenimiento Preventivo:

- **Con Pendiente:** muestra el registro cuando `pendiente > 0` **o** `facturas_pendientes > 0`.
- **Facturas Pendientes:** muestra el registro cuando `facturas_pendientes > 0`.

No se genera una consulta adicional a Aiven. El filtro actúa sobre `mpState_uni.rows`, igual que los filtros existentes de Estado, Periodicidad, Momento de facturación, Zona y Forma de pago.

## Archivo modificado

- `modules/cobranza-uni/cobranza-uni.js`

## Cambios aplicados

1. Se agregó `pendiente_tipo` al estado de filtros de MP.
2. Se agregó el select **Pendientes** a la barra de filtros.
3. Se agregó la lógica de `Con Pendiente` y `Facturas Pendientes` en `mpFilteredRows_uni()`.
4. `Limpiar filtros` también restablece este nuevo control.
5. No se modificó CSS: la cuadrícula responsive existente admite el control adicional.

## No incluido

- No se implementa el Bloque B de desglose económico.
- No se modifica Gestión de Crédito.
- No se modifica Venta Adicional.
- No se modifica backend.
- No se modifica Aiven/SQL.
- No se alteran los KPIs existentes.

## Validaciones realizadas

- Base local comparada contra el blob actual de GitHub: `a6e30aebebb231e4f5a70bcf16834b306f4096c3`.
- `node --check modules/cobranza-uni/cobranza-uni.js`: OK.
- Diff revisado: únicamente estado del filtro, condiciones de filtrado, control visual y reset.
- No se agregaron llamadas HTTP ni timers.

## Prueba funcional recomendada

1. Abrir **Mantenimiento Preventivo**.
2. Seleccionar `Con Pendiente`: deben quedar solo registros con saldo pendiente o facturas pendientes.
3. Seleccionar `Facturas Pendientes`: deben quedar solo registros con `facturas_pendientes > 0`.
4. Combinar con Estado/Zona/Periodicidad para confirmar que los filtros se aplican en conjunto.
5. Pulsar **Limpiar filtros** y confirmar que vuelve a `Todos`.
