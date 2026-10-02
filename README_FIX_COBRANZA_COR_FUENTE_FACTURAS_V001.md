# Cobranza CORELLIAN — Fuente y Facturas M2M; ajuste Hito → Factura → Pago

Base local revisada antes del ajuste: `main` en `91de7e1505233f8648a7a130b4ee881006a344ec` (2026-10-02). El árbol de trabajo estaba limpio.

## Comportamiento vigente

- Fuente acepta `condiciones_pago_dias` y los encabezados nuevos de vencimiento. La carga M2M de Fuente ignora los campos legacy de Factura y Pago del payload; mantiene `pago_total` como columna histórica.
- `POST /api/cobranza-cor/carga/facturas` mantiene la autenticación `requireCobranzaCorIntegration` con la identidad de Ventas. El payload sigue siendo `{ "registros": [{ "ppns": "P14302", "porcentaje": 1, "condicion": "Llegada a puerto", "moneda": "USD", "subtotal": 20549, "iva": 3287.84, "total": 23836.84, "factura": "CFV-8496", "estatus_factura_origen": "EN COBRANZA", "tipo_concepto": "HITO", "origen_registro": "LEGACY_HITO", "activo": 1 }] }`. Máximo: 5000 registros por petición, procesados en bloques de 300.
- La migración histórica es **insert-only** y conserva cada fila recibida, incluso dos filas idénticas con el mismo folio en el mismo Hito. Cada fila debe resolver exactamente un Hito activo mediante PPNS, porcentaje, condición, moneda, subtotal, IVA y total; cero o varios Hitos se rechazan. Se conservan las tolerancias 0.000001 y 0.005. La captura humana mantiene su protección contra folios duplicados.
- Las Facturas se crean como `No pagado`. La captura humana no puede forzar `Pagado`. El detalle calcula `importe_pagado`, `saldo` y `estatus_factura` desde `cobranza_rel_pagos.importe_aplicado`; un pago parcial conserva `No pagado` hasta cubrir el total.
- Al agregar o quitar una relación Pago ↔ Factura, la columna SQL `estatus_factura` se recalcula y actualiza en la misma transacción, con filtro por `id_factura_cor` y PPNS. Se conserva la regla actual que impide asignar una Factura a otro Pago distinto.
- El pagado y por cobrar de cada Hito, y el resumen por moneda, se derivan de las relaciones aplicadas a todas sus Facturas. La referencia visual del Hito conserva los folios repetidos.

## Verificación local

- `node --check` en los dos JS productivos modificados y las dos pruebas modificadas: correcto.
- Pruebas dirigidas de Cobranza COR (ocho archivos: carga de Facturas, CRUD/formulario, Fase 3, Fase 4, Pago ↔ Factura, Aditivas, Pagos Fase 3 y validación de equipos): 54 aprobadas, 0 fallidas. Se usaron dobles de prueba; el error de base de datos simulado por la prueba de Pagos Fase 3 es esperado.
- `npm run check` en `backend`: correcto.
- `npm test` en `backend`: 166 aprobadas, 0 fallidas.

No se ejecutaron pruebas contra Aiven, Sheets ni Azure. La integración real con base de datos permanece sin verificar. No se crearon tablas, no se alteró SQL, no se modificó la autenticación HMAC y no hubo escritura externa, push ni deploy.
