# FIX incremental — Cobranza CORELLIAN: Fuente y Facturas M2M

Base local: `main` en `534fd26652576ffe18e6b29c7ba7c2f56f46fbf4` (instrucción de 2026-10-02).

## Archivos incluidos

- `backend/src/modules/cobranza-cor/cobranza-cor.routes.js`
- `backend/src/modules/cobranza-cor/cobranza-cor.controller.js`
- `backend/src/modules/cobranza-cor/cobranza-cor.service.js`
- `backend/src/modules/cobranza-cor/cobranza-cor.repository.js`
- `tests/cobranza-cor-carga-facturas.test.js`
- Este README.

## Cambios

- Fuente acepta `condiciones_pago_dias` (entero >= 0 o NULL), los nuevos encabezados de vencimiento y días vencidos, y lo expone en Estado de Cuenta. La carga M2M de Fuente ignora `factura`, `estatus_factura` y `fecha_pago` del payload; conserva `pago_total`.
- Nuevo `POST /api/cobranza-cor/carga/facturas`, protegido por `requireCobranzaCorIntegration` con `INTEGRATION_VENTAS_ID` y `INTEGRATION_VENTAS_SECRET`.
- Payload: `{ "registros": [{ "ppns": "P14302", "porcentaje": 1, "condicion": "Llegada a puerto", "moneda": "USD", "subtotal": 20549, "iva": 3287.84, "total": 23836.84, "factura": "CFV-8496", "estatus_factura_origen": "EN COBRANZA", "tipo_concepto": "HITO", "origen_registro": "LEGACY_HITO", "activo": 1 }] }`. Máximo: 5000 registros; bloques de 300.
- Cada Factura se vincula exclusivamente con un Hito activo de `cobranza_fuente_cor` usando PPNS, porcentaje, condición, moneda, subtotal, IVA y total. Los textos se comparan con TRIM e ignorando mayúsculas; los NULL/vacíos se tratan de forma consistente. Tolerancias: 0.000001 para porcentaje y 0.005 para cada importe. Se exige exactamente un Hito; cero o varios producen rechazo de la fila. Se reutiliza la detección de Factura duplicada por PPNS, Hito y folio.
- La carga es solo INSERT. Toda Factura entra como `No pagado`, aunque el origen diga `PAGADO`; `EN COBRANZA` únicamente produce `estatus_cobranza = 'En Cobranza'`. No se crea relación con Pagos.

## Verificación local

- `node --check` en los cuatro JS productivos modificados y la prueba nueva: correcto.
- `npm run check` en `backend`: correcto.
- `npm test` en `backend`: 166 pruebas aprobadas, 0 fallidas.
- `node --test tests/cobranza-cor-carga-facturas.test.js tests/cobranza-cor-estados-cuenta-fase3-consolidacion.test.js tests/cobranza-cor-estados-cuenta-fase4-facturas.test.js`: 19 aprobadas, 0 fallidas. Las pruebas nuevas usan conexiones simuladas y cubren Fuente, creación/edición de Hitos, Factura vinculada, Hito ausente/ambiguo, duplicado, mismo folio en dos Hitos, origen PAGADO, 301 registros en dos bloques, fallo aislado por savepoint, límites, contrato HTTP y HMAC inválido.
- Corrida adicional de los 14 archivos `tests/cobranza-cor*.test.js`: 67 aprobadas, 4 fallidas. Tres aserciones antiguas esperan textos/rutas del frontend que ya no están en los archivos de `main` y que este FIX no modifica (`Crear Estado de Cuenta COR queda registrado en navegación y loader`, `Listado de Estados de Cuenta ofrece Crear nuevo`, `Moneda de Hito sale de Partidas General y porcentaje suma 100 por moneda`). El archivo `cobranza-cor-pagos-fase2.test.js` no pudo iniciar porque faltan `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` y `DB_NAME` en este entorno. La prueba dirigida actual de Pagos Fase 3 sí pasó dentro de la corrida amplia.

No se ejecutaron pruebas contra Aiven, Google Sheets ni un backend desplegado. La consulta SQL y la autenticación se verificaron localmente con dobles de prueba; la integración real queda pendiente de un entorno QA autorizado.

No se crearon ni modificaron tablas o esquema SQL. No se modificaron los archivos de Pagos. No hubo escritura externa, despliegue ni push.
