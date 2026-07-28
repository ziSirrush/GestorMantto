# Ventas Cotizaciones - Fase 3

## Objetivo

Habilitar la capa backend que consumirá el frontend para editar cotizaciones, cambiar estatus, reasignar responsables y registrar seguimientos.

## Normas de Desarrollo aplicadas

1. El frontend inicia la acción; el backend valida y persiste en Aiven MySQL.
2. No se impone una secuencia rígida de estatus ni aprobaciones no confirmadas.
3. El estatus debe pertenecer al catálogo autorizado de 12 valores.
4. Asesor y administrativo deben ser usuarios activos cuando se reasignan.
5. Solo se actualizan campos expresamente permitidos.
6. Toda escritura usa transacción y registra usuario, acción, fecha, IP, agente, motivo y valores relevantes.
7. Los seguimientos son acumulativos; no sustituyen el comentario histórico.
8. Los permisos existentes `VER`, `CREAR`, `EDITAR` y `ELIMINAR` se reutilizan.

## Endpoints nuevos

```text
PATCH /api/ventas/cotizaciones/:id/estatus
PATCH /api/ventas/cotizaciones/:id/asignacion
POST  /api/ventas/cotizaciones/:id/seguimientos
GET   /api/ventas/cotizaciones/:id/seguimientos
```

El endpoint general existente se conserva:

```text
PUT /api/ventas/cotizaciones/:id
```

## Ejemplos de cuerpos

### Cambiar estatus

```json
{
  "estatus_proyecto": "Seguimiento con Probabilidad",
  "comentario": "Cliente solicita revisión técnica.",
  "motivo": "Avance comercial"
}
```

### Reasignar

```json
{
  "id_asesor": 33,
  "id_admin": 34,
  "motivo": "Redistribución de cartera"
}
```

### Seguimiento

```json
{
  "comentario": "Se envió la propuesta actualizada.",
  "proxima_fecha": "2026-08-05"
}
```

## SQL obligatorio

Ejecutar una sola vez:

```text
backend/sql/20260728_VENTAS_COTIZACIONES_FASE_3.sql
```

## Archivos modificados

```text
backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.routes.js
backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.controller.js
backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.service.js
backend/src/modules/ventas-cotizaciones/ventas-cotizaciones.repository.js
backend/sql/20260728_VENTAS_COTIZACIONES_FASE_3.sql
backend/docs/README_VENTAS_FASE_3.md
```
