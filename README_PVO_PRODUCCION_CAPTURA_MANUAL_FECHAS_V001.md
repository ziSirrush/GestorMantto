# PVO-Producción · captura manual de fechas V001

Fecha: 2026-10-05  
Módulo: Logística → PVO-Producción

## Comportamiento

- Se retira la captura semiautomática. Las altas y ediciones trabajan en modo `MANUAL`.
- Las cinco fechas del seguimiento se capturan con calendario:
  - Fecha PVO.
  - Fecha de Visita.
  - Fecha entrega cubos.
  - Fecha envío Docs a Fábrica.
  - Fecha envío Pago a Fábrica.
- `log_ops.pvo`, `ins_fl.fecha_visita` e `ins_fl.fecha_posible_recepcion_cubo` ya no sustituyen los valores guardados en PVO-Producción.
- La comparación con esas fuentes se muestra únicamente en el detalle del registro. El listado y el alta no muestran alertas ni filtros de comparación.
- Si `ins_fl` devuelve varias fechas para el mismo PPNS, el detalle lo identifica como `FUENTE_MULTIPLE`; no elige una fecha silenciosamente.

## Estatus Producción

El selector se consulta y valida exclusivamente en `catalogo_general` con:

```text
area = Logistica
elemento = Estatus Produccion
activo = 1
```

No existe una lista fija de estatus en el frontend.

## Migración

Ejecutar `sql/20261005_LOGISTICA_PRODUCCION_CAPTURA_MANUAL_FECHAS_V001.sql` antes de desplegar el backend nuevo.

La migración:

1. conserva las fechas visibles anteriores cuando la fuente tiene un valor inequívoco;
2. deja `NULL` cuando `ins_fl` contiene varios valores, para exigir selección humana;
3. convierte los registros existentes a `MANUAL`;
4. cambia `modo_registro` a `ENUM('MANUAL')`;
5. no escribe en `log_ops` ni en `ins_fl`.

## Validación

```text
node --test tests/logistica_produccion_captura_manual_fechas_v001.test.js
cd backend && npm run check
```

